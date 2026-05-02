const https = require('https');
const fs = require('fs');
const path = require('path');

// Images to download
const images = [
  // Slider images
  {
    url: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2000&q=80',
    filename: 'slider-1-auctions.jpg',
    folder: 'slider'
  },
  {
    url: 'https://images.unsplash.com/photo-1594534475808-b18fc33b045e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2000&q=80',
    filename: 'slider-2-premium.jpg',
    folder: 'slider'
  },
  {
    url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2000&q=80',
    filename: 'slider-3-real-estate.jpg',
    folder: 'slider'
  },
  {
    url: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2000&q=80',
    filename: 'slider-4-vehicles.jpg',
    folder: 'slider'
  },
  // Category images
  {
    url: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
    filename: 'category-electronice.jpg',
    folder: 'categories'
  },
  {
    url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
    filename: 'category-moda.jpg',
    folder: 'categories'
  },
  {
    url: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
    filename: 'category-arta.jpg',
    folder: 'categories'
  },
  {
    url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
    filename: 'category-antichitati.jpg',
    folder: 'categories'
  },
  {
    url: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
    filename: 'category-auto.jpg',
    folder: 'categories'
  },
  {
    url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
    filename: 'category-imobiliare.jpg',
    folder: 'categories'
  }
];

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${path.basename(filepath)}`);
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        file.close();
        fs.unlinkSync(filepath);
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

async function downloadAll() {
  console.log('📥 Starting image downloads...\n');
  
  for (const img of images) {
    const dir = path.join(__dirname, '..', 'public', 'images', img.folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filepath = path.join(dir, img.filename);
    
    try {
      await downloadImage(img.url, filepath);
    } catch (error) {
      console.error(`❌ Error downloading ${img.filename}:`, error.message);
    }
  }
  
  console.log('\n✅ All downloads completed!');
}

downloadAll();

