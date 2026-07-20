const fs = require('fs').promises;
const path = require('path');

async function generateFilesJson() {
  const modelesDir = path.join(__dirname, 'public', 'Modeles');
  try {
    const files = await fs.readdir(modelesDir);
    const htmlFiles = files
      .filter(file => file.endsWith('.html') && file !== 'listFiles.html')
      .map(file => {
        const parts = file.split('_');
        return {
          name: file,
          brick: parts[0] || 'unknown',
          rayon: parts[1]?.replace('.html', '') || 'unknown',
          path: `/Modeles/${file}`
        };
      });

    await fs.writeFile(
      path.join(modelesDir, 'files.json'),
      JSON.stringify(htmlFiles, null, 2)
    );
    console.log('files.json generated successfully');
  } catch (err) {
    console.error('Error generating files.json:', err);
  }
}

generateFilesJson();