const msgEscaped = `UNB+UNOA:3+6191907700002+SN02583102G4+260226:1500+1'
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

function parseEancomEscaped(message) {
  // Determine if a character is an escape char (UNA can redefine this, default ?)
  // but we'll assume ? is escape since we see it.
  
  // Custom splitting function that respects the escape character
  function splitSegments(str) {
    const result = [];
    let currentSegment = '';
    let escaped = false;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (escaped) {
        currentSegment += char;
        escaped = false;
      } else if (char === '?') {
        currentSegment += char;
        escaped = true;
      } else if (char === "'") {
        result.push(currentSegment);
        currentSegment = '';
      } else {
        currentSegment += char;
      }
    }
    
    // Push the last piece if there's no trailing terminator
    if (currentSegment.trim()) {
      result.push(currentSegment);
    }
    
    return result;
  }
  
  const segments = splitSegments(msgEscaped).map(s => s.trim()).filter(Boolean);
  console.log(segments);
  
  // Also we need to unescape the parts
  function unescapeEancom(str) {
    if (!str) return str;
    // Replace ?' with ', ?+ with +, ?: with :, ?? with ?
    return str.replace(/\?([?+:'"])/g, '$1');
  }
  
  console.log("Unescaped FTX:");
  console.log(unescapeEancom(segments.find(s => s.startsWith('FTX'))));
}

parseEancomEscaped(msgEscaped);

