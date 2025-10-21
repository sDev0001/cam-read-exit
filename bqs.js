const axios = require('axios');
const config = require('./config.json');

async function testBQSAPI() {
  console.log('=== Testing BQS API ===\n');

  const testPlate = 'DOT1';
  const timestamp = Date.now().toString();

  console.log('Testing ENTRY barrier API...');
  console.log(Camera ID: ${config.entry.cameraId});
  console.log(Plate Number: ${testPlate});
  console.log(Timestamp: ${timestamp}\n);

  try {
    const entryResponse = await axios.post(
      config.bqs.apiUrl,
      {
        plate_number: testPlate,
        timestamp: timestamp,
        camera_id: config.entry.cameraId
      },
      {
        headers: {
          'accept': 'application/json',
          'accept-language': 'en',
          'authorization': Bearer ${config.bqs.bearerToken},
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('✅ Entry API Response:');
    console.log(JSON.stringify(entryResponse.data, null, 2));
    console.log(Status: ${entryResponse.status}\n);
    
  } catch (error) {
    console.error('❌ Entry API Error:');
    console.error(Message: ${error.message});
    if (error.response) {
      console.error(Status: ${error.response.status});
      console.error(Data: ${JSON.stringify(error.response.data, null, 2)});
    }
    console.log();
  }

  console.log('=== Test Complete ===');
}

testBQSAPI().catch(error => {
  console.error('Test script failed:', error);
  process.exit(1);
});
