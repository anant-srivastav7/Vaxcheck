/*
 * VaxCheck — Strike Capture Firmware (direct-drive build, no optocoupler)
 * ----------------------------------------------------------------------
 * Companion to capture_strikes.py and silent_test.py.
 *
 * Commands (typed in any serial monitor at 921600 baud, newline ending):
 *   'S'  -> capture 800 ms audio AND fire the solenoid at ~120 ms in.
 *           Used by capture_strikes.py for real strike data.
 *   'Q'  -> capture 800 ms audio WITHOUT firing the solenoid.
 *           Used by silent_test.py for noise floor diagnostics.
 *
 * Drive logic:
 *   Direct GPIO drive into an IRLZ44N MOSFET gate (R1 = 220Ω in series,
 *   R3 = 10kΩ pull-down to GND). NO optocoupler, NO R2 pull-up. The
 *   ESP32 GPIO actively drives the gate in both directions:
 *
 *       ESP32 GPIO HIGH = MOSFET gate HIGH = MOSFET ON   (= solenoid ON)
 *       ESP32 GPIO LOW  = MOSFET gate LOW  = MOSFET OFF  (= solenoid OFF)
 *
 *   This is the simpler, non-inverting control. The 10kΩ R3 pull-down
 *   ensures the MOSFET is OFF during ESP32 boot/reset, before pin init.
 *
 * Wiring (current build):
 *
 *   ICS-43434 mic:
 *     VDD   -> ESP32 3V3 (47µF bulk + 1nF Y1 ceramic at the mic)
 *     GND   -> ESP32 GND (star ground)
 *     SEL   -> tied to GND directly (no GPIO; selects left channel)
 *     SCK   -> GPIO 26  (mic BCLK)
 *     WS    -> GPIO 25  (mic LRCL)
 *     DOUT  -> GPIO 22  (mic data)
 *
 *   Solenoid via IRLZ44N (low-side switch, NO optocoupler):
 *     ESP32 GPIO 27 -> R1 (220Ω) -> MOSFET gate (G)
 *                      R3 (10kΩ) bridges gate to star ground (pull-down)
 *     MOSFET source (S) -> star ground
 *     MOSFET drain  (D) -> solenoid term 2 + flyback diode anode
 *     Solenoid term 1    -> LM2596 OUT+ (the 6V rail)
 *     LM2596 OUT-        -> star ground
 *
 *     1N4007 flyback diode across the solenoid (parallel):
 *       cathode (stripe) -> LM2596 OUT+ (6V rail)
 *       anode  (plain)  -> MOSFET drain / solenoid term 2
 *
 *   Capacitor placement:
 *     - 47µF/25V across LM2596 IN+ and IN- (12V input bulk)
 *     - 470µF/10V across LM2596 OUT+ and OUT- (6V output bulk)
 *     - 1.5nF ceramic parallel with the 470µF (HF filter)
 *     - 47µF/10V across ESP32 3V3 and GND (mic-side bulk)
 *     - 1nF Y1 ceramic across mic VDD and mic GND (mic HF bypass)
 *
 *   Builtin LED  -> GPIO 2 (blinks during capture)
 *
 * Sample rate:
 *   32 kHz (upgraded from the original 16 kHz).  Two reasons:
 *     1) Nyquist headroom: the capture ceiling moves 8 kHz -> 16 kHz.
 *        Earlier capture batches showed Prony peaks up to ~7.4 kHz,
 *        brushing the old 8 kHz limit (aliasing risk).
 *     2) ICS-43434 operating mode: per datasheet (DS-000069 rev 1.2),
 *        fs >= 23 kHz selects the mic's High-Performance mode
 *        (65 dBA SNR, 490 uA).  At 16 kHz the mic was running in
 *        Low-Power mode (64 dBA, 230 uA).
 *   The Python side reads fs from the binary frame header, so capture
 *   and analysis scripts need no changes.  NOTE: do not mix 16 kHz and
 *   32 kHz WAVs in one training set -- the band_* features are
 *   fs-relative.
 *
 *   If your ESP32 core version reports fs/4 instead of fs, set
 *   FS_CORRECTION to 4 in the config block below.
 *
 * Tests cleanly on Arduino-ESP32 core 2.0.x and 3.x.
 */

#include <Arduino.h>
#include <driver/i2s.h>

// =====================================================================
// CONFIG  (edit these only if your wiring differs)
// =====================================================================
#define PIN_I2S_BCK    26            // ICS-43434 SCK  (mic BCLK)
#define PIN_I2S_WS     25            // ICS-43434 WS   (mic LRCL)
#define PIN_I2S_DIN    22            // ICS-43434 SD   (mic DOUT)

#define PIN_STRIKE     27            // MOSFET gate driver (direct GPIO drive, via R1=220Ω)
#define PIN_LED        2             // capture status LED
#define PIN_BUTTON     0             // (BOOT pin -- reserved, unused path)

#define SAMPLE_RATE    32000         // desired fs (Nyquist 16 kHz; mic high-perf mode >= 23 kHz)
#define FS_CORRECTION  1             // set to 4 if captures run 4x too long
#define WINDOW_MS      800           // total capture window (includes pre-fire)
#define PRE_FIRE_MS    120           // quiet noise-floor window before strike
#define FIRE_MS        50            // solenoid pulse width

#define MAGIC0  0x56                 // 'V'
#define MAGIC1  0x58                 // 'X'
#define TAG     0x01                 // binary frame tag

// =====================================================================
// Derived constants
// =====================================================================
const int  FS          = SAMPLE_RATE / FS_CORRECTION;
const int  N_SAMPLES   = FS * WINDOW_MS / 1000;
const int  FIRE_SAMPLE = FS * PRE_FIRE_MS / 1000;

int16_t *samples = NULL;

// =====================================================================
// Forward declarations
// =====================================================================
void initI2S();
void doCapture(bool skipFire);
void sendRecord();

// =====================================================================
//                               SETUP
// =====================================================================
void setup() {
    Serial.begin(921600);
    delay(300);

    // Solenoid OFF at boot (direct-drive non-inverted: pin LOW = OFF).
    // R3 (10kΩ) holds the MOSFET gate at GND until firmware takes over.
    pinMode(PIN_STRIKE, OUTPUT);
    digitalWrite(PIN_STRIKE, LOW);

    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);

    pinMode(PIN_BUTTON, INPUT_PULLUP);   // reserved; unused in this build

    samples = (int16_t*) malloc(N_SAMPLES * sizeof(int16_t));
    if (!samples) {
        Serial.println("FATAL: malloc failed -- reduce WINDOW_MS or fs");
        while (1) delay(100);
    }

    initI2S();

    Serial.printf("VaxCheck capture ready.  "
                  "fs=%d  N=%d  pre=%dms  win=%dms  fire=HIGH\n",
                  FS, N_SAMPLES, PRE_FIRE_MS, WINDOW_MS);
    Serial.println("  'S' = strike + capture    'Q' = silent capture");
}

// =====================================================================
//                                LOOP
// =====================================================================
void loop() {
    if (!Serial.available()) return;

    char c = Serial.read();
    while (Serial.available()) Serial.read();   // swallow trailing chars

    switch (c) {
        case 'S': case 's':
            doCapture(false);     // full strike + capture
            break;
        case 'Q': case 'q':
            doCapture(true);      // silent capture (no fire)
            break;
        default:
            // ignore
            break;
    }
}

// =====================================================================
//                              I2S INIT
// =====================================================================
void initI2S() {
    const i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = FS,
        .bits_per_sample      = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count        = 8,
        .dma_buf_len          = 64,
        .use_apll             = true,
        .tx_desc_auto_clear   = true,
        .fixed_mclk           = 0,
    };
    const i2s_pin_config_t pins = {
        .bck_io_num   = PIN_I2S_BCK,
        .ws_io_num    = PIN_I2S_WS,
        .data_out_num = -1,
        .data_in_num  = PIN_I2S_DIN,
    };

    esp_err_t e1 = i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
    esp_err_t e2 = i2s_set_pin(I2S_NUM_0, &pins);

    if (e1 != ESP_OK || e2 != ESP_OK) {
        Serial.println("FAIL: I2S init failed -- check pin numbers / mic wiring");
        while (1) delay(1000);
    }
}

// =====================================================================
//                          DO CAPTURE
//   Records N_SAMPLES into the samples[] buffer, with or without
//   firing the solenoid at FIRE_SAMPLE.
//
//   The I2S DMA buffer holds ~32 ms of audio. We MUST keep draining
//   it continuously, otherwise older data gets overwritten by the
//   hardware. We drain DMA while the coil is energized, so the
//   capture window's audio timing is preserved exactly.
// =====================================================================
void doCapture(bool skipFire) {
    uint32_t idx   = 0;
    int32_t  word  = 0;
    size_t   got   = 0;

    digitalWrite(PIN_LED, HIGH);
    Serial.println("CAP");                                    // capture start marker

    while (idx < (uint32_t) N_SAMPLES) {
        i2s_read(I2S_NUM_0, &word, sizeof(word), &got, portMAX_DELAY);
        if (got != sizeof(word)) continue;

        samples[idx] = (int16_t)(word >> 8);                  // 24-bit -> 16-bit
        idx++;

        if (idx == (uint32_t) FIRE_SAMPLE) {
            if (skipFire) {
                // SILENT TEST path: don't fire.  Still drain DMA so we
                // hold the post-fire-window timing consistent.
                while (idx < (uint32_t)(FIRE_SAMPLE + (FS * FIRE_MS) / 1000)) {
                    size_t got_now = 0;
                    if (i2s_read(I2S_NUM_0, &word, sizeof(word),
                                 &got_now, 0) == ESP_OK
                        && got_now == sizeof(word)
                        && idx < (uint32_t) N_SAMPLES) {
                        samples[idx++] = (int16_t)(word >> 8);
                    }
                }
            } else {
                // REAL STRIKE path: drain DMA continuously while the
                // coil is energized.  Direct GPIO drive -> HIGH = ON.
                digitalWrite(PIN_STRIKE, HIGH);                // solenoid ON
                uint32_t fire_start = millis();
                while (millis() - fire_start < (uint32_t) FIRE_MS) {
                    size_t got_now = 0;
                    if (i2s_read(I2S_NUM_0, &word, sizeof(word),
                                 &got_now, 0) == ESP_OK
                        && got_now == sizeof(word)
                        && idx < (uint32_t) N_SAMPLES) {
                        samples[idx++] = (int16_t)(word >> 8);
                    }
                }
                digitalWrite(PIN_STRIKE, LOW);                 // solenoid OFF
            }
        }
    }

    digitalWrite(PIN_LED, LOW);
    sendRecord();
}

// =====================================================================
//                       SEND  RECORD
//   Binary frame on serial:
//     [0..1]  magic bytes 'V','X' (0x56, 0x58)
//     [2]     frame tag
//     [3]     reserved (0)
//     [4..5]  sample rate, big-endian
//     [6..7]  sample count (N), big-endian
//     [8..]   N int16 samples, little-endian
// =====================================================================
void sendRecord() {
    uint8_t hdr[8];
    hdr[0] = MAGIC0;
    hdr[1] = MAGIC1;
    hdr[2] = TAG;
    hdr[3] = 0;
    hdr[4] = (uint8_t)(FS >> 8);
    hdr[5] = (uint8_t)(FS & 0xFF);
    hdr[6] = (uint8_t)(N_SAMPLES >> 8);
    hdr[7] = (uint8_t)(N_SAMPLES & 0xFF);

    Serial.write(hdr, 8);
    Serial.write((const uint8_t*) samples, N_SAMPLES * sizeof(int16_t));
    Serial.flush();

    Serial.printf("DONE:N=%d fs=%d\n", N_SAMPLES, FS);
}
