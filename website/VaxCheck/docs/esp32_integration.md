# VaxCheck — ESP32 Firmware Integration & API Specification

This document provides the definitive guide and wire-level contract for flashing ESP32 microcontrollers to communicate with the VaxCheck backend. Whether using the hardware solenoid/digital I2S microphone setup or the software simulator, the exact same contract applies.

---

## 1. Physical Hardware Overview

- **Microcontroller**: ESP32 (e.g., ESP32-WROOM-32 or ESP32-S3)
- **Actuator**: 5V/12V Solenoid driver (via MOSFET/relay) to deliver calibrated acoustic strikes to the vaccine vial
- **Microphone**: Digital I2S microphone (e.g., INMP441) capturing acoustic ring-down at 44.1 kHz
- **On-Device Inference**: TinyML (TensorFlow Lite for Microcontrollers) computing:
  - Peak Amplitude (`peak_amplitude`, 0.0 to 1.0)
  - Exponential decay time constant in milliseconds (`decay_time_constant`)
  - Resonant dominant frequency in Hz (`dominant_frequency_hz`)
  - Classification Verdict (`PASS`, `FAIL`, `INCONCLUSIVE`)
  - Confidence score (0.0 to 1.0)

---

## 2. Authentication & Headers

Every physical device must be registered in the VaxCheck admin portal prior to deployment. The admin portal will issue:
1. `Device ID` (e.g. `dev-vax-001`)
2. `API Token` (e.g. `vax_tok_7c4f1a8e920d43bf9a710bc82f`)

### Required HTTP Headers

All HTTP requests from the ESP32 must include:
```http
Content-Type: application/json
Authorization: Bearer <API_TOKEN>
```
*Note: For maximum reliability, the ESP32 may also include `"device_auth_token": "<API_TOKEN>"` directly in the JSON payload body.*

---

## 3. API Endpoints for ESP32

Base URL: `http://<SERVER_IP>:5000/api/v1` (or HTTPS in production)

### A. Submit Completed Test Result (Single Live)

**Endpoint:** `POST /api/v1/tests`

**Request Headers:**
```http
POST /api/v1/tests HTTP/1.1
Host: 192.168.1.100:5000
Content-Type: application/json
Authorization: Bearer vax_tok_7c4f1a8e920d43bf9a710bc82f
```

**JSON Body (Exact Structure):**
```json
{
  "device_id": "dev-vax-001",
  "device_auth_token": "vax_tok_7c4f1a8e920d43bf9a710bc82f",
  "vial_batch_id": "MOD-2024-B882",
  "timestamp": "2026-10-04T10:15:30Z",
  "classification_result": "PASS",
  "confidence_score": 0.94,
  "strikes_used": 3,
  "strikes": [
    {
      "strike_number": 1,
      "peak_amplitude": 0.88,
      "decay_time_constant": 14.2,
      "dominant_frequency_hz": 4850.5
    },
    {
      "strike_number": 2,
      "peak_amplitude": 0.86,
      "decay_time_constant": 14.0,
      "dominant_frequency_hz": 4860.0
    },
    {
      "strike_number": 3,
      "peak_amplitude": 0.87,
      "decay_time_constant": 14.1,
      "dominant_frequency_hz": 4855.2
    }
  ]
}
```

**Expected Response:** `HTTP 201 Created`
```json
{
  "success": true,
  "inserted_count": 1,
  "test_ids": ["c4b8e219-913a-4a5f-b52b-7e6df83b27b4"],
  "batch_alert": null
}
```

If the batch shows concerning patterns (e.g. 3 or more failures), the response will include:
```json
{
  "success": true,
  "inserted_count": 1,
  "test_ids": ["c4b8e219-913a-4a5f-b52b-7e6df83b27b4"],
  "batch_alert": {
    "vial_batch_id": "MOD-2024-B882",
    "fail_count": 3,
    "total_tests": 8,
    "alert_message": "CRITICAL: 3 vials in batch MOD-2024-B882 have failed freeze-check. Quarantine batch recommended."
  }
}
```

---

### B. Submit Batched Offline Queue (Sync-on-Reconnect)

When the clinic has no WiFi, the ESP32 must save completed test records to its SPIFFS / LittleFS flash storage. Once WiFi is re-established, the ESP32 submits all queued tests in a single POST payload.

**Endpoint:** `POST /api/v1/tests`

**Request Headers:**
```http
POST /api/v1/tests HTTP/1.1
Host: 192.168.1.100:5000
Content-Type: application/json
Authorization: Bearer vax_tok_7c4f1a8e920d43bf9a710bc82f
```

**JSON Body (Exact Batch Structure):**
```json
{
  "device_id": "dev-vax-001",
  "device_auth_token": "vax_tok_7c4f1a8e920d43bf9a710bc82f",
  "tests": [
    {
      "vial_batch_id": "PFI-2024-X419",
      "timestamp": "2026-10-05T09:12:00Z",
      "classification_result": "PASS",
      "confidence_score": 0.92,
      "strikes_used": 3,
      "strikes": [
        {
          "strike_number": 1,
          "peak_amplitude": 0.82,
          "decay_time_constant": 15.1,
          "dominant_frequency_hz": 4820.0
        }
      ]
    },
    {
      "vial_batch_id": "PFI-2024-X419",
      "timestamp": "2026-10-05T09:14:30Z",
      "classification_result": "FAIL",
      "confidence_score": 0.88,
      "strikes_used": 3,
      "strikes": [
        {
          "strike_number": 1,
          "peak_amplitude": 0.38,
          "decay_time_constant": 34.0,
          "dominant_frequency_hz": 3050.0
        }
      ]
    }
  ]
}
```

**Expected Response:** `HTTP 201 Created`
```json
{
  "success": true,
  "inserted_count": 2,
  "test_ids": [
    "7a1e0123-...",
    "8b2f0456-..."
  ]
}
```

---

### C. Polling for Remote Test Commands

The health worker can click **"Trigger Device Test"** on the clinic tablet web app.
The ESP32 polls this endpoint in its main loop (every 3 to 5 seconds):

**Endpoint:** `GET /api/v1/devices/{device_id}/pending_commands`

**Request Headers:**
```http
GET /api/v1/devices/dev-vax-001/pending_commands HTTP/1.1
Host: 192.168.1.100:5000
Authorization: Bearer vax_tok_7c4f1a8e920d43bf9a710bc82f
```

**Response when a command is waiting:**
```json
{
  "commands": [
    {
      "id": "cmd-8921",
      "device_id": "dev-vax-001",
      "command_type": "START_TEST",
      "payload": {
        "vial_batch_id": "ROCHE-2024-C12",
        "worker_id": "usr-hw-101"
      },
      "created_at": "2026-10-05T11:20:00Z",
      "status": "PENDING"
    }
  ]
}
```

**Response when no commands:**
```json
{
  "commands": []
}
```

**Command Acknowledgement Endpoint:**
After executing the test, the ESP32 marks the command completed:
```http
POST /api/v1/devices/dev-vax-001/commands/cmd-8921/ack HTTP/1.1
Authorization: Bearer vax_tok_7c4f1a8e920d43bf9a710bc82f
Content-Type: application/json

{
  "status": "COMPLETED"
}
```

---

### D. Device Heartbeat & Battery Telemetry

To report online status and battery life without running a test:

**Endpoint:** `POST /api/v1/devices/{device_id}/heartbeat`

**Request:**
```http
POST /api/v1/devices/dev-vax-001/heartbeat HTTP/1.1
Authorization: Bearer vax_tok_7c4f1a8e920d43bf9a710bc82f
Content-Type: application/json

{
  "battery_level": 0.88,
  "firmware_version": "v1.0.4-tinyML"
}
```

---

## 4. Complete Arduino / ESP32 C++ Code Example

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid     = "Clinic_WiFi";
const char* password = "ClinicPassword123";

const char* serverUrl  = "http://192.168.1.100:5000/api/v1";
const char* deviceId   = "dev-vax-001";
const char* deviceToken = "vax_tok_7c4f1a8e920d43bf9a710bc82f";

unsigned long lastPollTime = 0;
const unsigned long pollInterval = 4000; // Poll every 4 seconds

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");
}

void loop() {
  if (millis() - lastPollTime >= pollInterval) {
    lastPollTime = millis();
    pollForCommands();
  }
  // If physical button pressed:
  // if (digitalRead(BUTTON_PIN) == LOW) {
  //   runAcousticTestAndSubmit("MANUAL-BATCH-001");
  // }
}

void pollForCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(serverUrl) + "/devices/" + deviceId + "/pending_commands";
  http.begin(url);
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  
  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<1024> doc;
    deserializeJson(doc, payload);
    JsonArray commands = doc["commands"];
    
    for (JsonObject cmd : commands) {
      String cmdId = cmd["id"].as<String>();
      String cmdType = cmd["command_type"].as<String>();
      
      if (cmdType == "START_TEST") {
        String batchId = cmd["payload"]["vial_batch_id"].as<String>();
        Serial.printf("Triggering test for batch: %s\n", batchId.c_str());
        
        // Execute physical strike sequence & TinyML analysis
        runAcousticTestAndSubmit(batchId.c_str());
        
        // Acknowledge command completion
        ackCommand(cmdId.c_str(), "COMPLETED");
      }
    }
  }
  http.end();
}

void ackCommand(const char* cmdId, const char* status) {
  HTTPClient http;
  String url = String(serverUrl) + "/devices/" + deviceId + "/commands/" + cmdId + "/ack";
  http.begin(url);
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<128> doc;
  doc["status"] = status;
  String jsonBody;
  serializeJson(doc, jsonBody);
  
  http.POST(jsonBody);
  http.end();
}

void runAcousticTestAndSubmit(const char* batchId) {
  // 1. Fire solenoid strikes (e.g. 3 strikes)
  // 2. Sample I2S microphone ring-down
  // 3. TinyML inference calculates classification: PASS / FAIL / INCONCLUSIVE
  
  HTTPClient http;
  String url = String(serverUrl) + "/tests";
  http.begin(url);
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<2048> doc;
  doc["device_id"] = deviceId;
  doc["device_auth_token"] = deviceToken;
  doc["vial_batch_id"] = batchId;
  doc["timestamp"] = "2026-10-05T12:00:00Z";
  doc["classification_result"] = "PASS";
  doc["confidence_score"] = 0.95;
  doc["strikes_used"] = 3;
  
  JsonArray strikes = doc.createNestedArray("strikes");
  JsonObject s1 = strikes.createNestedObject();
  s1["strike_number"] = 1;
  s1["peak_amplitude"] = 0.88;
  s1["decay_time_constant"] = 14.2;
  s1["dominant_frequency_hz"] = 4850.0;
  
  String jsonBody;
  serializeJson(doc, jsonBody);
  
  int httpCode = http.POST(jsonBody);
  if (httpCode == 201) {
    Serial.println("Test result submitted successfully!");
  } else {
    Serial.printf("Submission failed. HTTP Code: %d\n", httpCode);
    // Queue locally to LittleFS if offline
  }
  http.end();
}
```
