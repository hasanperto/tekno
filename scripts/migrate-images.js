import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateImages() {
    try {
        const projectsDir = path.join(__dirname, '..', 'public', 'uploads', 'projects');
        
        // Tüm alt klasörleri kontrol et
        const entries = await fs.readdir(projectsDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const projectId = entry.name;
                const projectDir = path.join(projectsDir, projectId);
                
                console.log(`Migrating images for project ${projectId}...`);
                
                // Klasördeki tüm dosyaları oku
                const files = await fs.readdir(projectDir);
                
                for (const file of files) {
                    const oldPath = path.join(projectDir, file);
                    const newFileName = file.startsWith('primary_') || file.startsWith('gallery_') 
                        ? file 
                        : `${file.startsWith('primary') ? 'primary' : 'gallery'}_${projectId}_${file}`;
                    const newPath = path.join(projectsDir, newFileName);
                    
                    // Dosyayı taşı
                    await fs.rename(oldPath, newPath);
                    console.log(`  Moved: ${file} -> ${newFileName}`);
                    
                    // Veritabanını güncelle
                    const oldDbPath = `projects/${projectId}/${file}`;
                    const newDbPath = `projects/${newFileName}`;
                    
                    await pool.execute(
                        'UPDATE project_images SET image_path = ? WHERE image_path = ?',
                        [newDbPath, oldDbPath]
                    );
                    console.log(`  Updated DB: ${oldDbPath} -> ${newDbPath}`);
                }
                
                // Boş klasörü sil
                try {
                    await fs.rmdir(projectDir);
                    console.log(`  Removed empty directory: ${projectId}/`);
                } catch (err) {
                    console.log(`  Could not remove directory ${projectId}/:`, err.message);
                }
            }
        }
        
        console.log('\n✅ Migration completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    }
}

migrateImages();

