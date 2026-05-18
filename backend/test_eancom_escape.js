const { parseEANCOM } = require('./eancom_parser');

const msg = `UNB+UNOA:3+6191907700002+SN02583102G4+260226:1500+1'
UNH+1+ORDRSP:D:01B:UN:EAN007'
BGM+231+FOU53225+9'
DTM+137:20260226:102'
NAD+BY+SN02583102G4::9++SENICO'
NAD+SU+6191907700002::9++Yutex Sarl'
CUX+2:EUR:9'
FTX+AAI+++: Le prix a été négocié avec l?'acheteur'
UNS+S'
CNT+2:0'
UNT+11+1'
UNZ+1+1'`;

const result = parseEANCOM(msg);
console.log(result.comment);
