/**
 * تشغيل اكتشاف Datasets جديدة
 * Run Discovery Job
 *
 * Usage: npm run discover
 */

import 'dotenv/config';
import { findNewDatasets, addNewDatasets, getDiscoveryStats } from '../services/discovery.js';
import { syncAllDatasets } from '../services/saudiDataSync.js';
import { logger } from '../utils/logger.js';

async function main() {
  const command = process.argv[2] || 'discover';

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     🔍 نظام اكتشاف البيانات المفتوحة السعودية                ║
║        Saudi Open Data Discovery System                        ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    switch (command) {
      case 'discover':
        logger.info('🔍 بدء عملية الاكتشاف...');
        const discoveryResult = await findNewDatasets();

        console.log(`
═══════════════════════════════════════════════════════════════
📊 نتائج الاكتشاف:
   📁 على الموقع: ${discoveryResult.total}
   ✅ معروفة: ${discoveryResult.known}
   🆕 جديدة: ${discoveryResult.newIds.length}
═══════════════════════════════════════════════════════════════
`);

        if (discoveryResult.newIds.length > 0) {
          console.log('🆕 الـ Datasets الجديدة:');
          discoveryResult.newIds.forEach((id, i) => {
            console.log(`   ${i + 1}. ${id}`);
          });
        }
        break;

      case 'add':
        // Add discovered datasets
        logger.info('➕ إضافة الـ Datasets الجديدة...');
        const discovery = await findNewDatasets();

        if (discovery.newIds.length > 0) {
          const added = await addNewDatasets(discovery.newIds);
          console.log(`✅ تم إضافة ${added} dataset جديدة`);
        } else {
          console.log('⚠️ لا توجد datasets جديدة للإضافة');
        }
        break;

      case 'sync':
        // Sync all datasets
        logger.info('🔄 مزامنة كل الـ Datasets...');
        const syncResult = await syncAllDatasets();

        console.log(`
═══════════════════════════════════════════════════════════════
📊 نتائج المزامنة:
   ✅ نجح: ${syncResult.success}
   ❌ فشل: ${syncResult.failed}
   📁 الإجمالي: ${syncResult.total}
═══════════════════════════════════════════════════════════════
`);
        break;

      case 'full':
        // Full process: discover, add, sync
        logger.info('🚀 بدء العملية الكاملة...');

        // Step 1: Discover
        console.log('\n📍 الخطوة 1: اكتشاف Datasets جديدة...');
        const fullDiscovery = await findNewDatasets();

        // Step 2: Add new datasets
        if (fullDiscovery.newIds.length > 0) {
          console.log(`\n📍 الخطوة 2: إضافة ${fullDiscovery.newIds.length} dataset جديدة...`);
          await addNewDatasets(fullDiscovery.newIds);
        }

        // Step 3: Sync all
        console.log('\n📍 الخطوة 3: مزامنة كل الـ Datasets...');
        const fullSync = await syncAllDatasets();

        console.log(`
═══════════════════════════════════════════════════════════════
📊 ملخص العملية الكاملة:
   🔍 مكتشفة: ${fullDiscovery.total}
   🆕 جديدة: ${fullDiscovery.newIds.length}
   ✅ تمت مزامنتها: ${fullSync.success}
   ❌ فشلت: ${fullSync.failed}
═══════════════════════════════════════════════════════════════
`);
        break;

      case 'stats':
        // Show statistics
        const stats = await getDiscoveryStats();

        console.log(`
═══════════════════════════════════════════════════════════════
📊 إحصائيات النظام:

   📁 Datasets:
      • الإجمالي: ${stats.datasets.total}
      • تمت مزامنتها: ${stats.datasets.synced}
      • في الانتظار: ${stats.datasets.pending}
      • فشلت: ${stats.datasets.failed}

   📄 السجلات: ${stats.records}

   🕐 آخر اكتشاف: ${stats.lastDiscovery || 'لم يتم بعد'}
═══════════════════════════════════════════════════════════════
`);
        break;

      default:
        console.log(`
الأوامر المتاحة:
─────────────────
  discover   اكتشاف Datasets جديدة من الموقع
  add        اكتشاف وإضافة Datasets جديدة
  sync       مزامنة كل الـ Datasets
  full       العملية الكاملة (اكتشاف + إضافة + مزامنة)
  stats      عرض إحصائيات النظام

أمثلة:
───────
  npm run discover                    # اكتشاف فقط
  npm run discover -- add             # اكتشاف وإضافة
  npm run discover -- sync            # مزامنة
  npm run discover -- full            # كل شيء
  npm run discover -- stats           # إحصائيات
`);
    }

    process.exit(0);
  } catch (error) {
    logger.error('❌ خطأ:', error);
    console.error(`\n❌ خطأ: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    process.exit(1);
  }
}

main();
