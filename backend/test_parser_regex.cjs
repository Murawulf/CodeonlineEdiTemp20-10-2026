const { parseEANCOM } = require('./eancom_parser.js');

const msg = `UNH+MESS001+ORDRSP:D:01B:UN:EAN010'
BGM+231+undefined+4'
DTM+137:202602270936:203'
RFF+ON:undefined'
NAD+BY+123::9++'
NAD+SU+456::9++'
FTX+AAI+++: Le prix a été négocié avec l?'acheteur'
LIN+1++1234:SRV'
QTY+21:10'
QTY+185:10'
PRI+AAA:10.00::NTP:1:PCE'
FTX+LIN+++: L?'article est bon'
UNS+S'
CNT+2:1'
UNT+15+MESS001'`;

const result = parseEANCOM(msg);
console.log("Global Comment:", result.comment);
console.log("Line 1 Comment:", result.items[0].comment);
