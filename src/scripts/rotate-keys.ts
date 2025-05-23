#!/usr/bin/env tsx

import { generateEncryptionKey, getRotationProgress, verifyRotation } from '../utils/encryption';

/**
 * Key Rotation CLI Tool
 * 
 * Usage:
 *   npm run rotate-keys generate    # Generate a new encryption key
 *   npm run rotate-keys status      # Check rotation progress
 *   npm run rotate-keys verify      # Verify all tokens can be decrypted
 */

const command = process.argv[2];

async function main() {
  switch (command) {
    case 'generate':
      const newKey = await generateEncryptionKey();
      console.log('🔑 New encryption key generated:');
      console.log(`ENCRYPTION_KEY="${newKey}"`);
      console.log('\n📋 Next steps:');
      console.log('1. Save current key as ENCRYPTION_KEY_OLD');
      console.log('2. Update ENCRYPTION_KEY with the new key');
      console.log('3. Deploy the changes');
      console.log('4. Monitor rotation progress with: npm run rotate-keys status');
      break;

    case 'status':
      // This would need to be run in the Cloudflare Worker context
      console.log('⚠️  Status check must be run from within the Worker environment');
      console.log('Use: wrangler dev --local and call the /admin/rotation-status endpoint');
      break;

    case 'verify':
      // This would need to be run in the Cloudflare Worker context
      console.log('⚠️  Verification must be run from within the Worker environment');
      console.log('Use: wrangler dev --local and call the /admin/verify-rotation endpoint');
      break;

    default:
      console.log('Key Rotation Tool');
      console.log('');
      console.log('Commands:');
      console.log('  generate    Generate a new encryption key');
      console.log('  status      Check rotation progress (requires Worker context)');
      console.log('  verify      Verify all tokens can be decrypted (requires Worker context)');
      console.log('');
      console.log('Example:');
      console.log('  npm run rotate-keys generate');
  }
}

main().catch(console.error);