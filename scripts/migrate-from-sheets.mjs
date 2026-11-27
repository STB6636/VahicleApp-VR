#!/usr/bin/env node
/**
 * Vehicle App — Phase 4 Legacy Google Sheets Data Migration CLI
 *
 * Usage:
 *   node scripts/migrate-from-sheets.mjs \
 *     --vehicles ./exports/Vehicles.csv \
 *     --activities ./exports/Activity_History.csv \
 *     [--personnel ./exports/Personnel.csv] \
 *     [--dry-run | --execute]
 *
 * Environment variables required for live org/personnel matching & --execute:
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  extractMaxSequenceNumber,
  parseCsvRecords,
  transformLegacyActivityRow,
  transformLegacyVehicleRow,
} from './lib/legacyParser.mjs';

function parseArgs(argv) {
  const args = { dryRun: true, vehicles: '', activities: '', personnel: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--execute') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--vehicles') args.vehicles = argv[++i] || '';
    else if (token === '--activities') args.activities = argv[++i] || '';
    else if (token === '--personnel') args.personnel = argv[++i] || '';
  }
  return args;
}

function readDataFile(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, 'utf8');
  if (abs.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }
  return parseCsvRecords(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.vehicles) {
    console.error('Usage: node scripts/migrate-from-sheets.mjs --vehicles <Vehicles.csv|json> [--activities <Activity_History.csv|json>] [--personnel <Personnel.csv|json>] [--dry-run|--execute]');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error('Error: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment.');
    process.exit(1);
  }

  const adminPublic = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });
  const adminVehicle = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'vehicleapp' },
  });

  console.log(`[Migrate] Mode: ${args.dryRun ? 'DRY-RUN (no writes)' : 'EXECUTE (writing to Supabase vehicleapp)'}`);

  const [{ data: vehicleTypes, error: vtErr }, { data: orgUnits, error: orgErr }, { data: personnelDir, error: pErr }] =
    await Promise.all([
      adminVehicle.from('vehicle_types').select('id, code, name_th'),
      adminPublic.from('org_units').select('id, parent_id, level_no, name_th').eq('is_active', true),
      adminPublic.from('v_personnel_directory').select('id, full_name, office_id, department_id'),
    ]);

  if (vtErr) throw vtErr;
  if (orgErr) throw orgErr;
  if (pErr) throw pErr;

  const vehicleTypesByCode = new Map((vehicleTypes || []).map((t) => [t.code, t]));
  const legacyPersonnelById = new Map();
  if (args.personnel) {
    const legacyPersonnelRows = readDataFile(args.personnel);
    for (const p of legacyPersonnelRows) {
      if (p.Personnel_ID) legacyPersonnelById.set(String(p.Personnel_ID).trim(), p);
    }
    console.log(`[Migrate] Loaded ${legacyPersonnelById.size} legacy personnel records for caretaker matching.`);
  }

  const rawVehicles = readDataFile(args.vehicles);
  const validVehicles = [];
  const vehicleErrors = [];
  const vehicleWarnings = [];

  for (const row of rawVehicles) {
    const res = transformLegacyVehicleRow(row, {
      vehicleTypesByCode,
      orgUnits: orgUnits || [],
      personnelDirectory: personnelDir || [],
      legacyPersonnelById,
    });
    if (!res.ok) {
      vehicleErrors.push(res.error);
    } else {
      validVehicles.push(res.record);
      for (const w of res.warnings) {
        vehicleWarnings.push(`${res.record.vehicle_code}: ${w}`);
      }
    }
  }

  console.log(`[Migrate] Vehicles parsed: ${validVehicles.length} valid, ${vehicleErrors.length} errors, ${vehicleWarnings.length} warnings.`);
  if (vehicleWarnings.length > 0) {
    console.log('[Migrate] Sample warnings (first 10):', vehicleWarnings.slice(0, 10));
  }
  if (vehicleErrors.length > 0) {
    console.error('[Migrate] Vehicle errors (first 10):', vehicleErrors.slice(0, 10));
  }

  const vehicleIdByCode = new Map();
  if (!args.dryRun && validVehicles.length > 0) {
    const { data: upserted, error: upErr } = await adminVehicle
      .from('vehicles')
      .upsert(validVehicles, { onConflict: 'vehicle_code' })
      .select('id, vehicle_code');
    if (upErr) throw upErr;
    for (const v of upserted || []) vehicleIdByCode.set(v.vehicle_code, v.id);
    console.log(`[Migrate] Upserted ${vehicleIdByCode.size} vehicles into vehicleapp.vehicles.`);
  } else {
    for (const v of validVehicles) vehicleIdByCode.set(v.vehicle_code, `dry-run-${v.vehicle_code}`);
  }

  let validActivities = [];
  const activityErrors = [];
  if (args.activities) {
    const rawActivities = readDataFile(args.activities);
    for (const row of rawActivities) {
      const res = transformLegacyActivityRow(row, vehicleIdByCode);
      if (!res.ok) activityErrors.push(res.error);
      else validActivities.push(res.record);
    }
    console.log(`[Migrate] Activities parsed: ${validActivities.length} valid, ${activityErrors.length} errors.`);

    if (!args.dryRun && validActivities.length > 0) {
      const { error: actErr } = await adminVehicle
        .from('vehicle_activities')
        .upsert(validActivities, { onConflict: 'activity_code' });
      if (actErr) throw actErr;
      console.log(`[Migrate] Upserted ${validActivities.length} activities into vehicleapp.vehicle_activities.`);
    }
  }

  const maxVh = extractMaxSequenceNumber(validVehicles.map((v) => v.vehicle_code), 'VH');
  const maxAct = extractMaxSequenceNumber(validActivities.map((a) => a.activity_code), 'ACT');
  console.log(`[Migrate] Suggested sequence sync SQL (run after execute):`);
  if (maxVh > 0) console.log(`  SELECT setval('vehicleapp.seq_vehicle_code', GREATEST(${maxVh}, (SELECT last_value FROM vehicleapp.seq_vehicle_code)));`);
  if (maxAct > 0) console.log(`  SELECT setval('vehicleapp.seq_activity_code', GREATEST(${maxAct}, (SELECT last_value FROM vehicleapp.seq_activity_code)));`);
}

main().catch((err) => {
  console.error('[Migrate] Fatal error:', err);
  process.exit(1);
});
