/**
 * VaxCheck Web Serial Service & React Hook
 * 
 * Manages physical USB Serial communication with ESP32 microcontrollers
 * using the W3C Web Serial API (navigator.serial).
 * 
 * Supports:
 * - Direct 115,200 baud serial connection to ESP32
 * - Standard protocol tokens:
 *     VAXCHECK_READY, TEST_STARTED, STRIKE_1, STRIKE_2, STRIKE_3, TEST_COMPLETE, TEST_ERROR:<msg>
 * - Structured JSON payloads:
 *     {"type":"TEST_RESULT", "vialId":"...", "result":"PASS", "confidence":0.96}
 *     {"status":"DONE", "verdict":"PASS", ...}
 * - Auto-detect disconnect / unplug events
 * - Detailed developer console logging
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export const SERIAL_STATUS = {
  DISCONNECTED: 'ESP32 Disconnected',
  CONNECTING: 'Connecting...',
  CONNECTED: 'ESP32 Connected',
  ERROR: 'Connection Error',
};

class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readableStreamClosed = null;
    this.writableStreamClosed = null;
    this.keepReading = false;
    this.listeners = new Set();
    this.status = SERIAL_STATUS.DISCONNECTED;
    this.portInfo = null;
    this.lastError = null;

    if (typeof window !== 'undefined' && 'serial' in navigator) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (event.target === this.port) {
          console.warn('[VAXCHECK SERIAL] USB device disconnected unexpectedly');
          this.handleDisconnect('USB cable unplugged or device disconnected');
        }
      });
    }
  }

  isSupported() {
    return typeof window !== 'undefined' && 'serial' in navigator;
  }

  getStatus() {
    return this.status;
  }

  getPortInfo() {
    return this.portInfo;
  }

  getLastError() {
    return this.lastError;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (err) {
        console.error('[VAXCHECK SERIAL] Listener callback error:', err);
      }
    });
  }

  setStatus(status, error = null) {
    this.status = status;
    this.lastError = error;
    this.notify('status', { status, error });
  }

  async connect(options = { baudRate: 115200 }) {
    if (!this.isSupported()) {
      const errMsg = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
      this.setStatus(SERIAL_STATUS.ERROR, errMsg);
      throw new Error(errMsg);
    }

    try {
      this.setStatus(SERIAL_STATUS.CONNECTING);

      // Request user port authorization
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: options.baudRate || 115200 });

      this.port = port;
      const rawInfo = port.getInfo ? port.getInfo() : {};
      this.portInfo = {
        usbVendorId: rawInfo.usbVendorId ? `0x${rawInfo.usbVendorId.toString(16)}` : 'ESP32',
        usbProductId: rawInfo.usbProductId ? `0x${rawInfo.usbProductId.toString(16)}` : 'Serial',
      };

      this.setStatus(SERIAL_STATUS.CONNECTED);
      console.log('[VAXCHECK SERIAL] Connected at', options.baudRate || 115200, 'baud');

      // Start asynchronous continuous read loop
      this.keepReading = true;
      this.readLoop();

      return true;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        // User cancelled port picker modal
        console.log('[VAXCHECK SERIAL] Port selection cancelled by user');
        this.setStatus(SERIAL_STATUS.DISCONNECTED);
        return false;
      }

      console.error('[VAXCHECK SERIAL] Connection error:', err);
      this.setStatus(SERIAL_STATUS.ERROR, err.message || 'Failed to open serial port');
      throw err;
    }
  }

  async readLoop() {
    while (this.port && this.port.readable && this.keepReading) {
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      this.reader = reader;

      let buffer = '';

      try {
        while (this.keepReading) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            buffer += value;
            const lines = buffer.split(/\r?\n/);
            // The last item may be an incomplete line
            buffer = lines.pop();

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                this.handleIncomingLine(trimmed);
              }
            }
          }
        }
      } catch (error) {
        if (this.keepReading) {
          console.warn('[VAXCHECK SERIAL] Serial read stream error:', error);
          this.notify('error', error.message);
        }
      } finally {
        try {
          reader.releaseLock();
        } catch (_) {}
      }
    }
  }

  handleIncomingLine(line) {
    console.log(`[VAXCHECK SERIAL] RX: ${line}`);

    // Notify raw line listeners
    this.notify('raw', line);

    // 1. Check for JSON messages
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const json = JSON.parse(line);
        this.notify('json', json);

        // Standardized result formats
        if (json.type === 'TEST_RESULT' || json.status === 'DONE' || json.verdict) {
          this.notify('test_result', {
            type: 'TEST_RESULT',
            result: json.result || json.verdict || 'PASS',
            confidence: typeof json.confidence === 'number' ? json.confidence : 0.95,
            vialId: json.vialId || json.vial_batch_id || null,
            dominant_frequency_hz: json.dominant_hz || json.dominant_frequency_hz,
            decay_ms: json.decay_ms || json.decay_time_constant,
            strikes: json.strikes || [],
            raw: json,
          });
        }
        return;
      } catch (e) {
        // Not valid JSON, continue with text protocol
      }
    }

    // 2. Exact protocol tokens
    if (line === 'VAXCHECK_READY' || line.includes('VaxCheck capture ready')) {
      this.notify('protocol', { event: 'READY', message: 'ESP32 Solenoid Chamber Ready' });
    } else if (line === 'TEST_STARTED' || line === 'CAP') {
      this.notify('protocol', { event: 'STARTED', message: 'Acoustic Test in Progress' });
      this.notify('protocol', { event: 'STRIKE', strike: 1, message: 'Strike 1 (Calibrated Impulse)' });
    } else if (line === 'STRIKE_1') {
      this.notify('protocol', { event: 'STRIKE', strike: 1, message: 'Strike 1 / 3' });
    } else if (line === 'STRIKE_2') {
      this.notify('protocol', { event: 'STRIKE', strike: 2, message: 'Strike 2 / 3' });
    } else if (line === 'STRIKE_3') {
      this.notify('protocol', { event: 'STRIKE', strike: 3, message: 'Strike 3 / 3' });
    } else if (line === 'TEST_COMPLETE' || line.startsWith('DONE:')) {
      this.notify('protocol', { event: 'COMPLETE', message: 'Acoustic Test Complete' });
    } else if (line.startsWith('TEST_ERROR:')) {
      const errDetail = line.substring('TEST_ERROR:'.length).trim();
      this.notify('protocol', { event: 'ERROR', message: errDetail || 'Test Error reported by hardware' });
    } else {
      // General line notice
      this.notify('line', line);
    }
  }

  async send(text) {
    if (!this.port || !this.port.writable) {
      const err = new Error('Cannot send command: ESP32 is not connected via USB Serial.');
      console.error('[VAXCHECK SERIAL]', err.message);
      throw err;
    }

    const command = text.endsWith('\n') ? text : `${text}\n`;
    console.log(`[VAXCHECK SERIAL] TX: ${command.trim()}`);

    const encoder = new TextEncoder();
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(encoder.encode(command));
    } finally {
      writer.releaseLock();
    }
  }

  async sendTrigger() {
    // Sends 'S\n' for VaxCheck_capture firmware and 'TRIGGER\n' for standard firmware
    return this.send('S\nTRIGGER\n');
  }

  async disconnect() {
    console.log('[VAXCHECK SERIAL] Disconnecting USB port...');
    this.keepReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (_) {}
    }

    if (this.readableStreamClosed) {
      try {
        await this.readableStreamClosed.catch(() => {});
      } catch (_) {}
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (err) {
        console.warn('[VAXCHECK SERIAL] Port close warning:', err);
      }
      this.port = null;
    }

    this.portInfo = null;
    this.setStatus(SERIAL_STATUS.DISCONNECTED);
    console.log('[VAXCHECK SERIAL] Disconnected');
  }

  handleDisconnect(reason = 'Device disconnected') {
    this.keepReading = false;
    this.port = null;
    this.portInfo = null;
    this.setStatus(SERIAL_STATUS.DISCONNECTED, reason);
  }
}

// Global serial singleton instance
export const serialManager = new SerialManager();

/**
 * Reusable React Hook for Web Serial ESP32 integration
 */
export function useSerial() {
  const [status, setStatus] = useState(serialManager.getStatus());
  const [portInfo, setPortInfo] = useState(serialManager.getPortInfo());
  const [lastError, setLastError] = useState(serialManager.getLastError());
  const [lastRxMessage, setLastRxMessage] = useState('');
  const [lastResult, setLastResult] = useState(null);

  // High-level acoustic testing progress state
  const [testProgress, setTestProgress] = useState({
    isRunning: false,
    phase: '',
    strike: 0,
    message: '',
    error: null,
  });

  useEffect(() => {
    const unsubscribe = serialManager.subscribe((event, data) => {
      if (event === 'status') {
        setStatus(data.status);
        setLastError(data.error);
        if (data.status === SERIAL_STATUS.CONNECTED) {
          setPortInfo(serialManager.getPortInfo());
        } else if (data.status === SERIAL_STATUS.DISCONNECTED) {
          setPortInfo(null);
          setTestProgress((prev) => ({ ...prev, isRunning: false }));
        }
      } else if (event === 'raw') {
        setLastRxMessage(data);
      } else if (event === 'protocol') {
        if (data.event === 'STARTED') {
          setTestProgress({
            isRunning: true,
            phase: 'STARTED',
            strike: 0,
            message: 'Acoustic Test in Progress',
            error: null,
          });
        } else if (data.event === 'STRIKE') {
          setTestProgress((prev) => ({
            ...prev,
            isRunning: true,
            strike: data.strike,
            phase: `STRIKE_${data.strike}`,
            message: `Strike ${data.strike} / 3`,
          }));
        } else if (data.event === 'COMPLETE') {
          setTestProgress((prev) => ({
            ...prev,
            isRunning: false,
            phase: 'COMPLETE',
            message: 'Acoustic Test Complete',
          }));
        } else if (data.event === 'ERROR') {
          setTestProgress((prev) => ({
            ...prev,
            isRunning: false,
            phase: 'ERROR',
            message: `Hardware Error: ${data.message}`,
            error: data.message,
          }));
        } else if (data.event === 'READY') {
          setTestProgress((prev) => ({
            ...prev,
            message: 'ESP32 Solenoid Chamber Ready',
          }));
        }
      } else if (event === 'test_result') {
        setLastResult(data);
      } else if (event === 'error') {
        setLastError(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const connect = useCallback(async (baudRate = 115200) => {
    return serialManager.connect({ baudRate });
  }, []);

  const disconnect = useCallback(async () => {
    return serialManager.disconnect();
  }, []);

  const sendTrigger = useCallback(async () => {
    return serialManager.sendTrigger();
  }, []);

  const send = useCallback(async (msg) => {
    return serialManager.send(msg);
  }, []);

  const clearTestResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return {
    isSupported: serialManager.isSupported(),
    status,
    isConnected: status === SERIAL_STATUS.CONNECTED,
    isConnecting: status === SERIAL_STATUS.CONNECTING,
    portInfo,
    error: lastError,
    lastRxMessage,
    testProgress,
    lastResult,
    connect,
    disconnect,
    sendTrigger,
    send,
    clearTestResult,
  };
}
