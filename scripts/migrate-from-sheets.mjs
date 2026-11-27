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
  normalizeOrgUnitsWithLevels,
  parseCsvRecords,
  transformLegacyActivityRow,
  transformLegacyVehicleRow,
} from './lib/legacyParser.mjs';

const UPSERT_CHUNK_SIZE = 200;

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

function dedupeByKey(records, keyField) {
  const map = new Map();
  let duplicates = 0;
  for (const rec of records) {
    const k = rec[keyField];
    if (map.has(k)) duplicates += 1;
    map.set(k, rec);
  }
  return { records: Array.from(map.values()), duplicates };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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

  // `public.org_units` stores `level_id` referencing `public.org_unit_levels(id)` (no denormalized `level_no` column).
  const [
    { data: vehicleTypes, error: vtErr },
    { data: orgUnitLevels, error: lvlErr },
    { data: rawOrgUnits, error: orgErr },
    { data: personnelDir, error: pErr },
  ] = await Promise.all([
    adminVehicle.from('vehicle_types').select('id, code, name_th'),
    adminPublic.from('org_unit_levels').select('id, level_no'),
    adminPublic.from('org_units').select('id, parent_id, level_id, name_th').eq('is_active', true),
    adminPublic.from('v_personnel_directory').select('id, full_name, office_id, department_id'),
  ]);

  if (vtErr) throw vtErr;
  if (lvlErr) throw lvlErr;
  if (orgErr) throw orgErr;
  if (pErr) throw pErr;

  const orgUnits = normalizeOrgUnitsWithLevels(rawOrgUnits || [], orgUnitLevels || []);
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
  const parsedVehicles = [];
  const vehicleErrors = [];
  const vehicleWarnings = [];

  for (const row of rawVehicles) {
    const res = transformLegacyVehicleRow(row, {
      vehicleTypesByCode,
      orgUnits,
      personnelDirectory: personnelDir || [],
      legacyPersonnelById,
    });
    if (!res.ok) {
      vehicleErrors.push(res.error);
    } else {
      parsedVehicles.push(res.record);
      for (const w of res.warnings) {
        vehicleWarnings.push(`${res.record.vehicle_code}: ${w}`);
      }
    }
  }

  const { records: validVehicles, duplicates: duplicateVehicles } = dedupeByKey(
    parsedVehicles,
    'vehicle_code'
  );
  if (duplicateVehicles > 0) {
    console.warn(`[Migrate] Deduplicated ${duplicateVehicles} duplicate vehicle_code rows (last row wins).`);
  }

  console.log(`[Migrate] Vehicles parsed: ${validVehicles.length} unique valid, ${vehicleErrors.length} errors, ${vehicleWarnings.length} warnings.`);
  if (vehicleWarnings.length > 0) {
    console.log('[Migrate] Sample warnings (first 10):', vehicleWarnings.slice(0, 10));
  }
  if (vehicleErrors.length > 0) {
    console.error('[Migrate] Vehicle errors (first 10):', vehicleErrors.slice(0, 10));
  }

  const vehicleIdByCode = new Map();
  if (!args.dryRun && validVehicles.length > 0) {
    for (const batch of chunkArray(validVehicles, UPSERT_CHUNK_SIZE)) {
      const { data: upserted, error: upErr } = await adminVehicle
        .from('vehicles')
        .upsert(batch, { onConflict: 'vehicle_code' })
        .select('id, vehicle_code');
      if (upErr) throw upErr;
      for (const v of upserted || []) vehicleIdByCode.set(v.vehicle_code, v.id);
    }
    console.log(`[Migrate] Upserted ${vehicleIdByCode.size} vehicles into vehicleapp.vehicles.`);
  } else {
    for (const v of validVehicles) vehicleIdByCode.set(v.vehicle_code, `dry-run-${v.vehicle_code}`);
  }

  let validActivities = [];
  const activityErrors = [];
  if (args.activities) {
    const rawActivities = readDataFile(args.activities);
    const parsedActivities = [];
    for (const row of rawActivities) {
      const res = transformLegacyActivityRow(row, vehicleIdByCode);
      if (!res.ok) activityErrors.push(res.error);
      else parsedActivities.push(res.record);
    }
    const dedupedAct = dedupeByKey(parsedActivities, 'activity_code');
    validActivities = dedupedAct.records;
    if (dedupedAct.duplicates > 0) {
      console.warn(`[Migrate] Deduplicated ${dedupedAct.duplicates} duplicate activity_code rows (last row wins).`);
    }
    console.log(`[Migrate] Activities parsed: ${validActivities.length} unique valid, ${activityErrors.length} errors.`);

    if (!args.dryRun && validActivities.length > 0) {
      for (const batch of chunkArray(validActivities, UPSERT_CHUNK_SIZE)) {
        const { error: actErr } = await adminVehicle
          .from('vehicle_activities')
          .upsert(batch, { onConflict: 'activity_code' });
        if (actErr) throw actErr;
      }
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
