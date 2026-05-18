
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const configService = require('./services/configService');

// Mock DB for configService initialization (it expects a db object with query or execute)
const mockDb = {
  execute: async (sql) => {
    if (sql.includes('SELECT * FROM app_parameters')) {
      // Return minimal parameters needed
      return [[
        { param_key: 'NETWORK_TOPOLOGY', param_value: '{"senegal":{"name":"Sénégal","apiUrl":"https://dev.codeonline-edi.net","ediUrl":"https://dev.codeonline-edi.net/api/edi/receive","countryCode":"SEN","country":"Senegal"},"tunisia":{"name":"Tunisie","apiUrl":"https://edi-dev.codeonline-info.com","ediUrl":"https://edi-dev.codeonline-info.com/api/edi/receive","countryCode":"TUN","country":"Tunisie"}}', param_type: 'json', is_public: 1 },
        { param_key: 'CURRENT_INSTANCE_CODE', param_value: 'senegal', param_type: 'string', is_public: 1 },
        { param_key: 'LOCAL_API_URL', param_value: 'http://localhost:5001', param_type: 'string', is_public: 1 }
      ]];
    }
    return [];
  },
  __isMysql: true
};

async function test() {
  await configService.initialize(mockDb);
  
  console.log('--- ENV ---');
  console.log('CURRENT_INSTANCE_CODE:', process.env.CURRENT_INSTANCE_CODE);
  console.log('LOCAL_API_URL:', process.env.LOCAL_API_URL);
  
  console.log('--- CONFIG SERVICE ---');
  console.log('API_URL_SENEGAL:', configService.get('API_URL_SENEGAL'));
  console.log('API_URL_TUNISIA:', configService.get('API_URL_TUNISIA'));
  console.log('Country API URL (senegal):', configService.getCountryApiUrl('senegal'));
  
  const currentInstance = configService.get('CURRENT_INSTANCE_CODE');
  console.log(`Current Instance from Config: '${currentInstance}'`);
}

test();
