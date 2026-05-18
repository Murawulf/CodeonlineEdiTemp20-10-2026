const msg = `UNB+UNOA:3+6191907700002+SN02583102G4+260226:1500+1'
UNH+1+ORDRSP:D:01B:UN:EAN007'
BGM+231+FOU53225+9'
DTM+137:20260226:102'
NAD+BY+SN02583102G4::9++SENICO'
NAD+SU+6191907700002::9++Yutex Sarl'
CUX+2:EUR:9'
FTX+AAI+++: Le prix a été négocié avec l?'acheteur et 1?+1?=2?: vrai??'
UNS+S'
CNT+2:0'
UNT+11+1'
UNZ+1+1'`;

const segments = msg.split(/(?<!\?)'/).map(s => s.replace(/\n/g, '').trim()).filter(Boolean);
for (const segment of segments) {
  const parts = segment.split(/(?<!\?)\+/);
  const segmentCode = parts[0];
  if (segmentCode === 'FTX') {
    const ftxType = parts[1];
    let ftxText = parts[4] || '';
    if (parts[4] && parts[4].includes(':')) {
      ftxText = parts[4].split(/(?<!\?):/).filter(Boolean).join(' ');
    }
    console.log("Raw text:", ftxText);
    const unescaped = ftxText.replace(/\?([?+:'"])/g, '$1');
    console.log("Unescaped text:", unescaped);
  }
}
