export function fixASC(buffer: ArrayBuffer): boolean {
  function findBytes(buffer: ArrayBuffer, bytes: number[]) {
    const view = new Uint8Array(buffer);
    for(let i = 0; i <= view.length - 4; i++) {
      if(view[i] === bytes[0] && view[i + 1] === bytes[1] &&
        view[i + 2] === bytes[2] && view[i + 3] === bytes[3]) {
        return i; // returns the starting index of the match
      }
    }
    return -1; // not found
  }

  function skipTagLength(offset: number, dv: DataView) {
    let lastFound = false;
    while(!lastFound) {
      const byte = dv.getUint8(offset);
      offset++;
      if(!(byte & 0x80)) {
        lastFound = true;
      }
    }
    return offset;
  }

  const valueToFind = [0x65, 0x73, 0x64, 0x73]; // esds
  let offset = findBytes(buffer, valueToFind);
  if(offset === -1) {
    return false;
  }

  const dv = new DataView(buffer);

  offset += 8; // skip type(4) + version(1) + flags(3)
  const tag3 = dv.getUint8(offset);
  if(tag3 !== 0x03) {
    return false;
  }
  offset++;
  offset = skipTagLength(offset, dv);
  offset += 3; // skip ES_ID(2) + flags(1)

  const tag4 = dv.getUint8(offset);
  if(tag4 !== 0x04) {
    return false;
  }
  offset++;
  offset = skipTagLength(offset, dv);
  offset += 13; // skip object type(1) + stream type(1) + buffer size(3) + max bitrate(4) + avg bitrate(4)

  const tag5 = dv.getUint8(offset);
  if(tag5 !== 0x05) {
    return false;
  }
  offset++;
  offset = skipTagLength(offset, dv);

  // It's ASC (Audio Specific Config)
  const asc1byte = dv.getUint8(offset);
  const asc2byte = dv.getUint8(offset + 1);

  // 0x1388 is broken, works if changed to 0x1398
  if(asc1byte === 0x13 && asc2byte === 0x88) {
    dv.setUint8(offset + 1, 0x98);
  }
  return true;
}
