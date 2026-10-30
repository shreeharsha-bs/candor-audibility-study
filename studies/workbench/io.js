/* Browser-local, bounded Cognition export reader. No requests or filesystem writes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/fflate-0.8.2.js'), typeof globalThis !== 'undefined' ? globalThis : root);
  else root.WBFiles = factory(root.fflate, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (fflate, root) {
  'use strict';
  const MiB = 1024 * 1024;
  const LIMITS = Object.freeze({ input: 50 * MiB, entry: 20 * MiB, expanded: 200 * MiB, entries: 2000 });
  const formats = /\.(csv|tsv|json|jsonl|ndjson)$/i;
  const fail = message => { throw new Error(message); };
  const check = (value, message) => { if (!value) fail(message); };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function hash(bytes) {
    if (root.crypto && root.crypto.subtle) return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (typeof require === 'function') return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    fail('This browser cannot verify file checksums. Open the workbench in a current browser over HTTPS.');
  }
  function text(bytes, name) { try { return decoder.decode(bytes); } catch (_) { fail('“' + name + '” is not valid UTF-8 text. Export the run as CSV or JSON from Cognition.'); } }
  function cleanName(name) {
    check(typeof name === 'string' && name.length > 0 && name.length <= 4096, 'The ZIP contains an invalid filename.');
    check(!/[\u0000-\u001f\u007f]/.test(name), 'The ZIP contains a filename with control characters.');
    const normalized = name.replace(/\\/g, '/');
    check(!normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized), 'Absolute paths are not accepted inside ZIP files.');
    const parts = normalized.split('/');
    check(!parts.some(part => part === '..' || part === '.'), 'Parent-directory or relative traversal paths are not accepted inside ZIP files.');
    check(!parts.some(part => part === '__proto__'), 'The ZIP contains an unsafe filename.');
    return normalized;
  }
  function skipReason(name) {
    if (name.endsWith('/')) return 'folder';
    if (name.split('/').some(part => part === '__MACOSX' || part === '.DS_Store' || part.startsWith('._'))) return 'macOS metadata';
    return formats.test(name) ? null : 'unsupported file type';
  }
  function zipEntries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), size = bytes.length;
    const u16 = p => { check(p >= 0 && p + 2 <= size, 'The ZIP is truncated.'); return view.getUint16(p, true); };
    const u32 = p => { check(p >= 0 && p + 4 <= size, 'The ZIP is truncated.'); return view.getUint32(p, true); };
    let end = -1;
    for (let p = size - 22, min = Math.max(0, size - 65557); p >= min; p--) if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === size) { end = p; break; }
    check(end >= 0, 'The ZIP directory is missing or truncated. Download the ZIP again.');
    check(u16(end + 4) === 0 && u16(end + 6) === 0 && u16(end + 8) === u16(end + 10), 'Split or multi-disk ZIP files are not supported.');
    const count = u16(end + 10), directorySize = u32(end + 12), directoryOffset = u32(end + 16);
    check(count !== 65535 && directorySize !== 0xffffffff && directoryOffset !== 0xffffffff, 'ZIP64 archives are not supported. Export smaller batches.');
    check(!(end >= 20 && u32(end - 20) === 0x07064b50), 'ZIP64 archives are not supported. Export smaller batches.');
    check(count <= LIMITS.entries, 'This ZIP has more than 2,000 entries. Import smaller batches.');
    check(directoryOffset + directorySize <= end && directoryOffset <= end, 'The ZIP directory has invalid bounds.');
    let cursor = directoryOffset, expanded = 0;
    const entries = [], names = new Set(), ranges = [];
    const extra = (start, length) => {
      const stop = start + length; check(stop <= size, 'The ZIP has a truncated extra field.');
      while (start < stop) { check(start + 4 <= stop, 'The ZIP has a malformed extra field.'); const type = u16(start), len = u16(start + 2); check(type !== 1, 'ZIP64 archives are not supported. Export smaller batches.'); start += 4 + len; check(start <= stop, 'The ZIP has a malformed extra field.'); }
    };
    for (let i = 0; i < count; i++) {
      check(cursor + 46 <= directoryOffset + directorySize && u32(cursor) === 0x02014b50, 'The ZIP directory is malformed.');
      const flags = u16(cursor + 8), compression = u16(cursor + 10), crc = u32(cursor + 16), compressedSize = u32(cursor + 20), originalSize = u32(cursor + 24);
      const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32), disk = u16(cursor + 34), external = u32(cursor + 38), localOffset = u32(cursor + 42);
      check((flags & 0x2041) === 0, 'Encrypted ZIP files are not supported. Export an unencrypted batch.');
      check(compression === 0 || compression === 8, 'This ZIP uses unsupported compression. Use a standard ZIP export.');
      check(disk === 0, 'Split or multi-disk ZIP files are not supported.');
      check(compressedSize !== 0xffffffff && originalSize !== 0xffffffff && localOffset !== 0xffffffff, 'ZIP64 archives are not supported. Export smaller batches.');
      check(originalSize <= LIMITS.entry, 'A file in this ZIP expands beyond 20 MiB. Export smaller files.');
      expanded += originalSize; check(expanded <= LIMITS.expanded, 'This ZIP expands beyond 200 MiB. Import smaller batches.');
      check((external >>> 16 & 0xf000) !== 0xa000, 'Symbolic links are not accepted inside ZIP files.');
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      check(next <= directoryOffset + directorySize, 'The ZIP directory contains a truncated filename.');
      const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      let decodedName;
      try { decodedName = flags & 0x800 ? decoder.decode(rawName) : fflate.strFromU8(rawName, true); } catch (_) { fail('The ZIP contains an invalid encoded filename.'); }
      const name = cleanName(decodedName);
      check(!names.has(name), 'The ZIP contains duplicate filenames: ' + name); names.add(name);
      extra(cursor + 46 + nameLength, extraLength);
      check(localOffset + 30 <= directoryOffset && u32(localOffset) === 0x04034b50, 'The ZIP contains an invalid local file header.');
      check(u16(localOffset + 6) === flags && u16(localOffset + 8) === compression, 'The ZIP file header disagrees with its directory.');
      const localNameLength = u16(localOffset + 26), localExtraLength = u16(localOffset + 28);
      const payloadOffset = localOffset + 30 + localNameLength + localExtraLength, payloadEnd = payloadOffset + compressedSize;
      check(localNameLength === nameLength && payloadEnd <= directoryOffset && payloadOffset <= directoryOffset, 'The ZIP contains invalid file bounds.');
      for (let j = 0; j < nameLength; j++) check(bytes[localOffset + 30 + j] === rawName[j], 'The ZIP filename differs between its headers.');
      extra(localOffset + 30 + localNameLength, localExtraLength);
      if (!(flags & 8)) check(u32(localOffset + 14) === crc && u32(localOffset + 18) === compressedSize && u32(localOffset + 22) === originalSize, 'The ZIP file size or checksum differs between its headers.');
      else {
        let descriptor = payloadEnd;
        if (u32(descriptor) === 0x08074b50) descriptor += 4;
        check(descriptor + 12 <= directoryOffset, 'The ZIP has a truncated data descriptor.');
        check(u32(descriptor) === crc && u32(descriptor + 4) === compressedSize && u32(descriptor + 8) === originalSize, 'The ZIP data descriptor differs from its directory.');
      }
      check(compression !== 0 || compressedSize === originalSize, 'An uncompressed ZIP entry has conflicting sizes.');
      ranges.push([localOffset, payloadEnd]);
      entries.push({ name, compression, crc, compressedSize, originalSize, payloadOffset, skip: skipReason(name) });
      cursor = next;
    }
    check(cursor === directoryOffset + directorySize, 'The ZIP directory entry count or size is inconsistent.');
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) check(ranges[i][0] >= ranges[i - 1][1], 'The ZIP contains overlapping file entries.');
    return entries;
  }
  function expand(bytes, entry) {
    const compressed = bytes.subarray(entry.payloadOffset, entry.payloadOffset + entry.compressedSize);
    if (entry.compression === 0) return compressed;
    const chunks = []; let length = 0;
    try {
      const inflater = new fflate.Inflate((chunk) => {
        length += chunk.length;
        check(length <= entry.originalSize && length <= LIMITS.entry, 'The ZIP expands beyond its declared file size.');
        chunks.push(chunk.slice());
      });
      if (!compressed.length) fail('The ZIP contains an empty compressed stream.');
      // Small chunks also bound temporary inflater output if its size metadata is false.
      for (let p = 0; p < compressed.length; p += 1024) inflater.push(compressed.subarray(p, p + 1024), p + 1024 >= compressed.length);
    } catch (error) { fail('Could not decompress “' + entry.name + '”: ' + (error.message || 'invalid compressed data')); }
    check(length === entry.originalSize, 'The expanded size of “' + entry.name + '” differs from its directory.');
    const output = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }
  async function unpack(file) {
    check(file && typeof file.arrayBuffer === 'function', 'Choose a ZIP, CSV, TSV, JSON or JSONL file.');
    check(!(Number.isFinite(file.size) && file.size > LIMITS.input), 'This file is larger than 50 MiB. Import smaller batches.');
    const sourceName = String(file.name || 'batch'), bytes = new Uint8Array(await file.arrayBuffer());
    check(bytes.byteLength <= LIMITS.input, 'This file is larger than 50 MiB. Import smaller batches.');
    const archiveHash = await hash(bytes), documents = [], skipped = [];
    if (/\.zip$/i.test(sourceName)) {
      check(fflate && fflate.Inflate && fflate.strFromU8, 'The ZIP reader could not load. Reload this page.');
      for (const entry of zipEntries(bytes)) {
        if (entry.skip) { skipped.push({ name: entry.name, reason: entry.skip }); continue; }
        const raw = expand(bytes, entry);
        check(raw.length === entry.originalSize && crc32(raw) === entry.crc, 'Checksum verification failed for “' + entry.name + '”. Download the ZIP again.');
        documents.push({ name: entry.name, text: text(raw, entry.name), sha256: await hash(raw) });
      }
    } else {
      check(formats.test(sourceName), 'Choose a Cognition ZIP, CSV, TSV, JSON or JSONL export.');
      check(bytes.length <= LIMITS.entry, 'This text file is larger than 20 MiB. Import smaller files.');
      documents.push({ name: sourceName, text: text(bytes, sourceName), sha256: archiveHash });
    }
    check(documents.length > 0, 'No CSV, TSV, JSON or JSONL files were found in this ZIP.');
    return { documents, archiveHash, sourceName, skipped };
  }
  return Object.freeze({ unpack, LIMITS });
});
