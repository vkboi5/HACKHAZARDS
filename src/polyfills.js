import { Buffer } from 'buffer';
import * as process from 'process';
import { Readable } from 'readable-stream';

// Fix for crypto libraries that use Buffer but don't properly import it
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
  window.global = window.global || window;
  window.process = window.process || process;

  // Fix for missing process.version in some libraries
  if (!window.process.version) {
    window.process.version = 'v16.0.0'; // fake version
  }

  // Fix for readable-stream/browserify libraries
  window.process.nextTick = window.process.nextTick || setTimeout;
  
  // Fix for libraries that access process.argv
  window.process.argv = window.process.argv || [];

  // Fix for the TypeError: Cannot read properties of undefined (reading 'slice')
  if (typeof String.prototype.slice === 'undefined') {
    String.prototype.slice = function(start, end) {
      return this.substring(start, end);
    };
  }
  
  // Make sure these objects exist for browserify-sign
  window._readableState = window._readableState || {};
  window._writableState = window._writableState || {};
  
  // Fix for buffer.slice issue
  if (Buffer.prototype && !Buffer.prototype._isBuffer) {
    Buffer.prototype._isBuffer = true;
  }

  // Fix for libraries that access global.Uint8Array
  window.global.Uint8Array = window.global.Uint8Array || Uint8Array;

  console.log('Polyfills loaded successfully');
} 