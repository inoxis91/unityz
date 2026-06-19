import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '.env') });

const clientId = process.env.WCL_CLIENT_ID;
const clientSecret = process.env.WCL_CLIENT_SECRET;

console.log('--- WCL Connection Test ---');
console.log('CLIENT_ID found:', clientId ? 'YES (length: ' + clientId.length + ')' : 'NO');
console.log('CLIENT_SECRET found:', clientSecret ? 'YES (length: ' + clientSecret.length + ')' : 'NO');

if (clientId?.includes('your_') || clientSecret?.includes('your_')) {
  console.warn('⚠️ Warning: Placeholders detected in WCL credentials!');
}

async function run() {
  if (!clientId || !clientSecret) {
    console.error('❌ Error: WCL_CLIENT_ID and WCL_CLIENT_SECRET must be set in backend/.env');
    return;
  }

  try {
    console.log('\nStep 1: Fetching Access Token...');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await axios.post(
      'https://www.warcraftlogs.com/oauth/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );

    const token = tokenRes.data.access_token;
    console.log('✅ Access Token retrieved successfully!');
    console.log('Token (truncated):', token.substring(0, 20) + '...');

    const reportCode = 'VNpLb7F61ymQvWHP';
    console.log(`\nStep 2: Fetching Report Metadata for ${reportCode}...`);

    const query = `
      query ($code: String!) {
        reportData {
          report(code: $code) {
            title
            owner { name }
            zone { name }
            fights(killType: All) {
              id
              name
              difficulty
              kill
              encounterID
              fightPercentage
              startTime
              endTime
            }
          }
        }
      }
    `;

    const apiRes = await axios.post(
      'https://www.warcraftlogs.com/api/v2/client',
      { query, variables: { code: reportCode } },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (apiRes.data.errors) {
      console.error('❌ GraphQL API Errors:', JSON.stringify(apiRes.data.errors, null, 2));
      return;
    }

    const report = apiRes.data?.data?.reportData?.report;
    if (!report) {
      console.error('❌ No report found. Response structure:', JSON.stringify(apiRes.data, null, 2));
      return;
    }

    console.log('✅ Report Meta retrieved successfully!');
    console.log('Title:', report.title);
    console.log('Zone:', report.zone?.name);
    console.log('Owner:', report.owner?.name);
    console.log('Fights found:', report.fights?.length || 0);

    const bossFights = (report.fights || []).filter((f: any) => f.encounterID !== 0);
    console.log('Boss Fights found (f.encounterID !== 0):', bossFights.length);
    console.log('Fights list:', bossFights.map((f: any) => `${f.name} (${f.kill ? 'KILL' : 'WIPE'} - ${f.fightPercentage}%)`).join(', '));

    if (bossFights.length > 0) {
      const firstFight = bossFights.find((f: any) => f.kill) || bossFights[0];
      console.log(`\nStep 3: Fetching Combat Tables for first fight: ${firstFight.name} (ID: ${firstFight.id}, KILL: ${firstFight.kill})...`);
      
      const tableQuery = `
        query ($code: String!, $fightId: Int!) {
          reportData {
            report(code: $code) {
              damageTable: table(fightIDs: [$fightId], dataType: DamageDone)
              healingTable: table(fightIDs: [$fightId], dataType: Healing)
              rankings: rankings(fightIDs: [$fightId])
              deathsTable: table(fightIDs: [$fightId], dataType: Deaths)
            }
          }
        }
      `;

      const tableRes = await axios.post(
        'https://www.warcraftlogs.com/api/v2/client',
        { query: tableQuery, variables: { code: reportCode, fightId: firstFight.id } },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        }
      );

      if (tableRes.data.errors) {
        console.error('❌ GraphQL Table Errors:', JSON.stringify(tableRes.data.errors, null, 2));
        return;
      }

      const tables = tableRes.data?.data?.reportData?.report;
      const dEntries = tables?.damageTable?.data?.entries || [];
      const hEntries = tables?.healingTable?.data?.entries || [];
      const rankings = tables?.rankings || {};
      const deathsEntries = tables?.deathsTable?.data?.entries || [];

      console.log('✅ Tables fetched successfully!');
      console.log(`DamageDone entries: ${dEntries.length}`);
      console.log(`Healing entries: ${hEntries.length}`);
      console.log(`Deaths entries: ${deathsEntries.length}`);
      console.log('Full JSON of first 3 deaths:', JSON.stringify(deathsEntries.slice(0, 3), null, 2));
      if (dEntries.length > 0) {
        console.log('Full JSON of first Damage Entry:', JSON.stringify(dEntries[0], null, 2));
        console.log('Top 3 Damage Entries:', dEntries.slice(0, 3).map((e: any) => `${entryInfo(e)}`).join(', '));
      }
    }

  } catch (err: any) {
    console.error('❌ Error during request:', err.response?.data || err.message);
  }
}

function entryInfo(e: any): string {
  return `${e.name} (${e.type}) - Total: ${e.total}`;
}

run();
