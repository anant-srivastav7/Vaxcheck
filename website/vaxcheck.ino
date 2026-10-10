/*
 * VaxCheck Hardware Diagnostic Sketch
 * ------------------------------------
 * Purpose: verify every part of the wiring (mic, MOSFET/solenoid driver,
 * grounding) is actually working correctly BEFORE running real strike tests.
 *
 * Pin configuration — matches the wiring plan discussed earlier:
 *   ICS-43434 mic:
 *     3V   -> ESP32 3V3
 *     GND  -> ESP32 GND
 *     SEL  -> tied directly to GND (not an ESP32 pin, no code needed for it)
 *     BCLK -> GPIO 26
 *     LRCL -> GPIO 25
 *     DOUT -> GPIO 22
 *
 *   Solenoid driver:
 *     GPIO 27 -> 220 ohm resistor -> MOSFET gate
 *     MOSFET gate -> 10k ohm resistor -> GND (pull-down)
 *     MOSFET source -> common GND
 *     MOSFET drain -> solenoid -> +5V (separate supply)
 *     Flyback diode across solenoid, cathode (banded end) -> +5V
 *
 * If your actual GPIO numbers differ from the #defines below, change them
 * here to match your real wiring before uploading.
 *
 * HOW TO USE:
 *   1. Upload this sketch, open Serial Monitor at 115200 baud, line ending
 *      set to "Newline" or "Both NL & CR".
 *   2. Follow the numbered menu, IN ORDER, the first time you run this.
 *   3. Test 1 requires the solenoid's drain-side wire DISCONNECTED first —
 *      read the warning it prints before you confirm. This is what makes
 *      it safe to hold the gate HIGH for several seconds without
 *      overheating or over-stressing the solenoid coil.
 */

#include <driver/i2s.h>

// ---------- Pin definitions — change these if your wiring differs ----------
#define MIC_BCLK_PIN      26
#define MIC_LRCL_PIN      25
#define MIC_DOUT_PIN      22
#define SOLENOID_GATE_PIN 27

#define I2S_PORT     I2S_NUM_0
#define SAMPLE_RATE  16000
#define I2S_BUF_LEN  1024

// Solenoid pulse duration in milliseconds. Normal operation: 120.
// For the "let the multimeter settle" voltage-sag diagnostic, temporarily
// set this to 1000 (1 second), test, then change it back to 120 before
// doing any real strike testing.
#define PULSE_DURATION_MS 120

int32_t i2sBuffer[I2S_BUF_LEN];
bool micInitialized = false;

void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(SOLENOID_GATE_PIN, OUTPUT);
  digitalWrite(SOLENOID_GATE_PIN, LOW);   // solenoid OFF at boot, always

  Serial.println("\n\n===================================");
  Serial.println("   VaxCheck Hardware Diagnostic");
  Serial.println("===================================");
  Serial.println("Configured pins:");
  Serial.printf("  Mic  BCLK      -> GPIO %d\n", MIC_BCLK_PIN);
  Serial.printf("  Mic  LRCL      -> GPIO %d\n", MIC_LRCL_PIN);
  Serial.printf("  Mic  DOUT      -> GPIO %d\n", MIC_DOUT_PIN);
  Serial.printf("  Solenoid gate  -> GPIO %d\n", SOLENOID_GATE_PIN);
  Serial.println("Cross-check these against your breadboard right now.");

  printMenu();
}

void printMenu() {
  Serial.println("\n----- MENU -----");
  Serial.println("1 = MOSFET gate logic-level test  (DISCONNECT solenoid drain wire first!)");
  Serial.println("2 = Fire solenoid ONCE  (short pulse — reconnect solenoid for this)");
  Serial.println("3 = Microphone test  (checks I2S is alive and producing real data)");
  Serial.println("4 = Full integration test  (fires solenoid + listens at the same time)");
  Serial.println("Type a number (1-4) and press Enter:");
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    while (Serial.available()) Serial.read();  // clear any trailing newline junk

    switch (c) {
      case '1': testMosfetGate();      break;
      case '2': fireSolenoidOnce();    break;
      case '3': testMicrophone();      break;
      case '4': fullIntegrationTest(); break;
      default: break;
    }
    printMenu();
  }
}

// ---------------------------------------------------------
// TEST 1 — MOSFET gate logic level
// Safe to hold HIGH for several seconds ONLY because the
// solenoid's drain-side wire should be disconnected for this
// test — no real current flows, so nothing heats up or wears out.
// ---------------------------------------------------------
void testMosfetGate() {
  Serial.println("\n--- Test 1: MOSFET Gate Logic Level ---");
  Serial.println("!! Make sure the solenoid's drain-side wire is DISCONNECTED before continuing !!");
  Serial.println("This test holds the gate HIGH for several seconds. If the solenoid is still");
  Serial.println("connected, it WILL stay energized that whole time, which can overheat it.");
  Serial.println("Type 'y' once disconnected and ready, or anything else to cancel:");

  while (!Serial.available()) { delay(50); }
  char confirm = Serial.read();
  while (Serial.available()) Serial.read();

  if (confirm != 'y' && confirm != 'Y') {
    Serial.println("Cancelled.");
    return;
  }

  Serial.println("Setting gate HIGH now. Probe the gate pin (red) and GND (black).");
  Serial.println("Expected reading: close to 3.3V");
  digitalWrite(SOLENOID_GATE_PIN, HIGH);
  for (int i = 5; i > 0; i--) {
    Serial.printf("  ...%d seconds left\n", i);
    delay(1000);
  }

  digitalWrite(SOLENOID_GATE_PIN, LOW);
  Serial.println("Gate is now LOW. Expected reading: close to 0V.");
  Serial.println("If you read close to 3.3V when commanded and close to 0V when off,");
  Serial.println("your ESP32-to-gate signal path is confirmed working.");
  Serial.println("--- Test 1 complete. Reconnect the solenoid before Test 2. ---");
}

// ---------------------------------------------------------
// TEST 2 — Single solenoid fire
// Short pulse only — enough to actuate and confirm movement,
// not long enough to stress an intermittent-duty solenoid coil.
// ---------------------------------------------------------
void fireSolenoidOnce() {
  Serial.println("\n--- Test 2: Single Solenoid Fire ---");
  Serial.println("Make sure the solenoid IS connected now. Firing in 3 seconds...");
  delay(3000);

  digitalWrite(SOLENOID_GATE_PIN, HIGH);
  delay(PULSE_DURATION_MS);
  digitalWrite(SOLENOID_GATE_PIN, LOW);

  Serial.println("Pulse sent. Did you see/hear the plunger move?");
  Serial.println("If nothing happened: check the 5V supply is plugged in, check the");
  Serial.println("flyback diode isn't reversed (a backwards diode can prevent firing),");
  Serial.println("and re-check the drain/source orientation on the MOSFET.");
  Serial.println("--- Test 2 complete ---");
}

// ---------------------------------------------------------
// TEST 3 — Microphone check
// Initializes I2S and reads real samples, checking for
// flat/dead data (a strong sign of a wiring problem) versus
// actual varying signal (mic is alive).
// ---------------------------------------------------------
void testMicrophone() {
  Serial.println("\n--- Test 3: Microphone Check ---");

  if (!micInitialized) {
    i2s_config_t i2s_config = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
      .sample_rate = SAMPLE_RATE,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,   // matches SEL tied to GND
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 4,
      .dma_buf_len = 256,
      .use_apll = false
    };
    i2s_pin_config_t pin_config = {
      .bck_io_num = MIC_BCLK_PIN,
      .ws_io_num = MIC_LRCL_PIN,
      .data_out_num = I2S_PIN_NO_CHANGE,
      .data_in_num = MIC_DOUT_PIN
    };

    esp_err_t err1 = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    esp_err_t err2 = i2s_set_pin(I2S_PORT, &pin_config);

    if (err1 != ESP_OK || err2 != ESP_OK) {
      Serial.println("FAIL: I2S driver could not initialize. Check pin numbers and wiring.");
      return;
    }
    micInitialized = true;
    Serial.println("I2S driver initialized successfully.");
  }

  Serial.println("Reading audio samples... this just checks the mic is alive and talking.");
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, i2sBuffer, sizeof(i2sBuffer), &bytesRead, 500 / portTICK_PERIOD_MS);

  int samplesRead = bytesRead / sizeof(int32_t);
  if (samplesRead == 0) {
    Serial.println("FAIL: No samples were read at all. Check BCLK/LRCL/DOUT wiring and mic power.");
    return;
  }

  int32_t minVal = i2sBuffer[0];
  int32_t maxVal = i2sBuffer[0];
  for (int i = 1; i < samplesRead; i++) {
    if (i2sBuffer[i] < minVal) minVal = i2sBuffer[i];
    if (i2sBuffer[i] > maxVal) maxVal = i2sBuffer[i];
  }
  int32_t range = maxVal - minVal;

  Serial.printf("Samples read: %d\n", samplesRead);
  Serial.printf("Min value: %ld   Max value: %ld   Range: %ld\n", (long)minVal, (long)maxVal, (long)range);

  if (range < 1000) {
    Serial.println("FLAG: Signal range is very small / near-flat.");
    Serial.println("Likely causes: 3V or GND not connected, SEL not tied to GND,");
    Serial.println("or BCLK/LRCL/DOUT swapped.");
  } else {
    Serial.println("PASS: Mic is producing varying data -- it's alive and wired correctly.");
  }
  Serial.println("--- Test 3 complete ---");
}

// ---------------------------------------------------------
// TEST 4 — Full integration test
// Fires one short solenoid pulse and captures mic data right
// after, so you can confirm the whole signal chain works together.
// ---------------------------------------------------------
void fullIntegrationTest() {
  Serial.println("\n--- Test 4: Full Integration Test ---");
  if (!micInitialized) {
    Serial.println("Run Test 3 first so the microphone is initialized.");
    return;
  }
  Serial.println("Make sure the solenoid is connected and aimed at your test vial.");
  Serial.println("Firing and listening in 3 seconds...");
  delay(3000);

  // Fire the solenoid
  digitalWrite(SOLENOID_GATE_PIN, HIGH);
  delay(PULSE_DURATION_MS);
  digitalWrite(SOLENOID_GATE_PIN, LOW);

  // Immediately capture audio
  size_t bytesRead = 0;
  i2s_read(I2S_PORT, i2sBuffer, sizeof(i2sBuffer), &bytesRead, 500 / portTICK_PERIOD_MS);
  int samplesRead = bytesRead / sizeof(int32_t);

  if (samplesRead == 0) {
    Serial.println("FAIL: No audio captured after the strike.");
    return;
  }

  int32_t minVal = i2sBuffer[0];
  int32_t maxVal = i2sBuffer[0];
  for (int i = 1; i < samplesRead; i++) {
    if (i2sBuffer[i] < minVal) minVal = i2sBuffer[i];
    if (i2sBuffer[i] > maxVal) maxVal = i2sBuffer[i];
  }
  int32_t range = maxVal - minVal;

  Serial.printf("Peak-to-peak amplitude captured after strike: %ld\n", (long)range);
  if (range < 1000) {
    Serial.println("FLAG: Barely any signal captured around the strike.");
    Serial.println("Check mic placement/distance from the vial, and re-check mic wiring.");
  } else {
    Serial.println("PASS: A real acoustic event was captured right after the strike.");
    Serial.println("Your solenoid, mic, and their timing relationship are all working together.");
  }
  Serial.println("--- Test 4 complete ---");
}
