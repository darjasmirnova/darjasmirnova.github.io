const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to fetch cats
app.get('/api/cats', async (req, res) => {
  try {
    const response = await axios.get('https://api.thecatapi.com/v1/images/search', {
      params: {
        limit: 12,
        has_breeds: 1
      }
    });
    
    const cats = response.data.map(cat => ({
      id: cat.id,
      url: cat.url,
      breed: cat.breeds && cat.breeds.length > 0 
        ? cat.breeds[0].name 
        : 'Unknown breed',
      description: cat.breeds && cat.breeds.length > 0 
        ? cat.breeds[0].description 
        : 'Beautiful cat'
    }));
    
    res.json(cats);
  } catch (error) {
    console.error('Error fetching cats:', error);
    res.status(500).json({ error: 'Failed to fetch cats' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
