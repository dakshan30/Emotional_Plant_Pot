/*
  Emotional Plant Pot - Frontend-Compatible Sketch
  ------------------------------------------------
  Keeps the original emotion + OLED animation logic,
  adds API compatibility for the React frontend.

  API ENDPOINTS:
    GET /health    -> {"ok":true,"ip":"..."}
    GET /sensors   -> full payload
    GET /telemetry -> frontend-friendly payload with moisture/temperature/light
*/

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =========================================================
// CONFIG
// =========================================================
const char* WIFI_SSID = "onlybuns";
const char* WIFI_PASS = "123456788";

#define DHTPIN       18
#define DHTTYPE      DHT11
#define SOIL_PIN     34
#define LDR1_PIN      5
#define LDR2_PIN     19
#define OLED_SDA     21
#define OLED_SCL     22

const int SOIL_DRY = 3200;
const int SOIL_WET = 1300;

// =========================================================
// OBJECTS
// =========================================================
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
AsyncWebServer   server(80);
DHT              dht(DHTPIN, DHTTYPE);

// =========================================================
// FACE GEOMETRY
// =========================================================
#define ZONE_Y  16
#define FCX     64
#define FCY     40
#define FCR     22
#define ELX    (FCX-11)
#define ERX    (FCX+11)
#define EYY    (FCY-6)
#define EYR     4
#define BROW_SPAN 4
#define BROW_DY  (EYR+4)
#define SMR      9

// =========================================================
// EMOTIONS
// =========================================================
#define E_HAPPY    0
#define E_THIRSTY  1
#define E_SLEEPY   2
#define E_STRESSED 3

// =========================================================
// SENSOR DATA
// =========================================================
struct SensorData {
  int    soilRaw     = 0;
  int    soilPct     = 0;
  float  temperature = NAN;
  float  humidity    = NAN;
  bool   dhtOk       = false;
  int    ldr1        = 1;
  int    ldr2        = 1;
  String lightState  = "DARK";
  uint32_t ts        = 0;
} sens;

// =========================================================
// ANIMATION STATE
// =========================================================
float sEye=1.0f, sBrow=0.5f, sZzz=0.0f, sSweat=0.0f, sCheek=1.0f;
float tEye=1.0f, tBrow=0.5f, tZzz=0.0f, tSweat=0.0f, tCheek=1.0f;

int      curEmo      = E_HAPPY;
uint32_t lastFrame   = 0;
uint32_t lastSensor  = 0;
uint32_t lastWifi    = 0;
uint32_t lastBlinkAt = 0;
uint32_t nextBlink   = 3000;
uint32_t nextShake   = 0;

float phBreathe=0, phBlink=0, phTear=0, phZzz=0, phWobble=0;
bool  blinking  = false;
float blinkAmt  = 1.0f;
float shakeX    = 0, shakeY = 0;

#define FPS 30

// =========================================================
// HELPERS
// =========================================================
inline float lp(float a, float b, float t) { return a + (b-a)*t; }
inline float cf(float v, float lo, float hi){ return v<lo?lo:(v>hi?hi:v); }

// Frontend expects numeric light in lux-ish scale.
int estimatedLux() {
  if (sens.lightState == "BRIGHT") return 900;
  if (sens.lightState == "DARK") return 120;
  return 500;
}

void addCorsHeaders(AsyncWebServerResponse* res) {
  res->addHeader("Access-Control-Allow-Origin", "*");
  res->addHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res->addHeader("Access-Control-Allow-Headers", "Content-Type");
  res->addHeader("Cache-Control", "no-store");
}

void sendCorsPreflight(AsyncWebServerRequest* req) {
  AsyncWebServerResponse* res = req->beginResponse(204);
  addCorsHeaders(res);
  req->send(res);
}

// =========================================================
// PIXEL-CLIPPED DRAW PRIMITIVES
// =========================================================
inline void SP(int x, int y, bool v=true){
  if(x>=0 && x<128 && y>=ZONE_Y && y<64)
    oled.drawPixel(x, y, v ? WHITE : BLACK);
}

void SL(int x0,int y0,int x1,int y1,bool v=true){
  int dx=abs(x1-x0), dy=abs(y1-y0);
  int sx=x0<x1?1:-1, sy=y0<y1?1:-1, e=dx-dy;
  for(;;){
    SP(x0,y0,v);
    if(x0==x1 && y0==y1) break;
    int e2=2*e;
    if(e2>-dy){ e-=dy; x0+=sx; }
    if(e2< dx){ e+=dx; y0+=sy; }
  }
}

void SC(int cx,int cy,int r,bool v=true){
  int x=r,y=0,err=0;
  while(x>=y){
    SP(cx+x,cy-y,v); SP(cx-x,cy-y,v);
    SP(cx+x,cy+y,v); SP(cx-x,cy+y,v);
    SP(cx+y,cy-x,v); SP(cx-y,cy-x,v);
    SP(cx+y,cy+x,v); SP(cx-y,cy+x,v);
    y++;
    if(err<=0) err+=2*y+1;
    else { x--; err+=2*(y-x)+1; }
  }
}

void FC(int cx,int cy,int r,bool v=true){
  for(int dy=-r; dy<=r; dy++){
    int w=(int)sqrtf((float)(r*r - dy*dy));
    for(int dx=-w; dx<=w; dx++) SP(cx+dx, cy+dy, v);
  }
}

void SA(int cx,int cy,int r,float a0,float a1,bool v=true){
  int steps=max(48, r*4), px=-9999, py=-9999;
  for(int i=0; i<=steps; i++){
    float a = (a0 + (a1-a0)*i/steps) * 0.01745329f;
    int x = cx + (int)roundf(r * cosf(a));
    int y = cy - (int)roundf(r * sinf(a));
    if(px!=-9999) SL(px,py,x,y,v);
    px=x; py=y;
  }
}

void TA(int cx,int cy,int r,float a0,float a1){
  SA(cx,cy,r,  a0,a1);
  SA(cx,cy,r-1,a0,a1);
}

// =========================================================
// FACE PARTS
// =========================================================
void eyeOpen(int ex,int ey){
  SC(ex,ey,EYR); SC(ex,ey,EYR-1);
  FC(ex,ey,2);
  FC(ex,ey,1,false);
  SP(ex+1,ey-1);
}
void eyeHalf(int ex,int ey){
  TA(ex,ey,EYR,200,340);
  SL(ex-EYR,ey-1,ex+EYR,ey-1);
  SL(ex-EYR,ey-2,ex+EYR,ey-2);
}
void eyeDroopy(int ex,int ey){
  SA(ex,ey,EYR,225,315);
  SL(ex-EYR,ey,  ex+EYR,ey);
  SL(ex-EYR,ey-1,ex+EYR,ey-1);
  SL(ex-EYR,ey-2,ex+EYR,ey-2);
  SL(ex-EYR,ey-3,ex+EYR,ey-3);
}
void eyeClosed(int ex,int ey){
  SL(ex-EYR-1,ey,  ex+EYR+1,ey);
  SL(ex-EYR,  ey+1,ex+EYR,  ey+1);
}
void eyeWide(int ex,int ey){
  SC(ex,ey,EYR); SC(ex,ey,EYR-1);
  FC(ex,ey,2); FC(ex,ey,1,false);
  SP(ex+1,ey-1); SP(ex+2,ey-1);
}
void eyeSad(int ex,int ey,bool left){
  SC(ex,ey,EYR-1);
  FC(ex,ey,2); FC(ex,ey,1,false);
  SP(ex+1,ey-1);
  if(left) SL(ex+2,ey-2,ex+4,ey-4);
  else     SL(ex-2,ey-2,ex-4,ey-4);
}

void eyeDraw(int ex,int ey,float open,int emo,bool left=true){
  if(emo==E_STRESSED){
    float eff = cf(0.65f+open*0.35f, 0.65f, 1.0f);
    if(eff>0.85f) eyeWide(ex,ey); else eyeHalf(ex,ey);
    return;
  }
  if(emo==E_THIRSTY){
    if(open>0.6f)  eyeSad(ex,ey,left);
    else if(open>0.2f) eyeHalf(ex,ey);
    else           eyeClosed(ex,ey);
    return;
  }
  if(open>0.85f)       eyeOpen(ex,ey);
  else if(open>0.45f)  eyeHalf(ex,ey);
  else if(open>0.1f)   eyeDroopy(ex,ey);
  else                 eyeClosed(ex,ey);
}

void browHappy(int ex,int ey){
  int by=ey-BROW_DY;
  for(int dx=-BROW_SPAN; dx<=BROW_SPAN; dx++){
    float nx=(float)dx/BROW_SPAN;
    int dy=(int)(-2.0f*(1.0f-nx*nx));
    SP(ex+dx,by+dy); SP(ex+dx,by+dy+1);
  }
}
void browSad(int ex,int ey,bool left){
  int by=ey-BROW_DY;
  for(int dx=-BROW_SPAN; dx<=BROW_SPAN; dx++){
    float t=(float)(dx+BROW_SPAN)/(2*BROW_SPAN);
    int dy = left ? (int)(-3.0f*t) : (int)(-3.0f*(1.0f-t));
    SP(ex+dx,by+dy); SP(ex+dx,by+dy+1);
  }
}
void browAngry(int ex,int ey,bool left){
  int by=ey-BROW_DY;
  if(left){
    SL(ex-BROW_SPAN,by+2,ex+BROW_SPAN,by-3);
    SL(ex-BROW_SPAN,by+3,ex+BROW_SPAN,by-2);
    SL(ex-BROW_SPAN,by+1,ex+BROW_SPAN,by-4);
  } else {
    SL(ex-BROW_SPAN,by-3,ex+BROW_SPAN,by+2);
    SL(ex-BROW_SPAN,by-2,ex+BROW_SPAN,by+3);
    SL(ex-BROW_SPAN,by-4,ex+BROW_SPAN,by+1);
  }
}
void browFlat(int ex,int ey){
  int by=ey-BROW_DY;
  SL(ex-BROW_SPAN,by,  ex+BROW_SPAN,by);
  SL(ex-BROW_SPAN,by+1,ex+BROW_SPAN,by+1);
}
void browDraw(int ex,int ey,float angle,bool left){
  if     (angle> 0.5f) browHappy(ex,ey);
  else if(angle> 0.0f) browFlat(ex,ey);
  else if(angle>-0.5f) browSad(ex,ey,left);
  else                 browAngry(ex,ey,left);
}

void mouthSmile(int cx,int my,bool big){
  int r=big?SMR+1:SMR, off=big?4:3;
  TA(cx,my-off,r,210,330);
  if(big) SL(cx-6,my+2,cx+6,my+2);
}
void mouthFrown(int cx,int my){
  TA(cx,my+4,SMR,30,150);
}
void mouthOpenSad(int cx,int my){
  SC(cx,my+4,5); SC(cx,my+4,4);
  SL(cx-3,my+9, cx-1,my+10);
  SL(cx-1,my+10,cx+1,my+10);
  SL(cx+1,my+10,cx+3,my+9);
}
void mouthYawn(int cx,int my){
  SC(cx,my+2,6); SC(cx,my+2,5);
  FC(cx,my+2,3,false);
}
void mouthWavy(int cx,int my,float phase){
  int steps=50, ppx=-9999, ppy=-9999;
  for(int i=0; i<=steps; i++){
    float t=(float)i/steps;
    int x=cx-11+(int)(t*22);
    int y=my+(int)(sinf(t*3.14159f*3.5f+phase)*3.0f);
    if(ppx!=-9999) SL(ppx,ppy,x,y);
    ppx=x; ppy=y;
  }
  ppx=-9999;
  for(int i=0; i<=steps; i++){
    float t=(float)i/steps;
    int x=cx-11+(int)(t*22);
    int y=my+1+(int)(sinf(t*3.14159f*3.5f+phase)*3.0f);
    if(ppx!=-9999) SP(x,y);
    ppx=x;
  }
}

void drawCheeks(){
  for(int dx=-2; dx<=2; dx++){
    SP(ELX-7+dx,EYY+3); SP(ERX+7+dx,EYY+3);
    if(abs(dx)<=1){
      SP(ELX-7+dx,EYY+2); SP(ELX-7+dx,EYY+4);
      SP(ERX+7+dx,EYY+2); SP(ERX+7+dx,EYY+4);
    }
  }
}
void drawTear(float prog){
  if(prog<=0.0f) return;
  int sy=EYY+EYR+1, ey2=FCY+FCR-7;
  int ty=sy+(int)(prog*(ey2-sy));
  int tr=max(1,(int)(prog*2.5f));
  FC(ELX,ty,tr);
  SL(ELX,sy,ELX,ty-tr);
}
void drawSweat(float sz){
  if(sz<0.1f) return;
  int sx=FCX+14, sy=FCY-14;
  int r=max(1,(int)(sz*3.0f));
  FC(sx,sy,r);
  SL(sx,sy-r,sx,sy-r-3);
  SL(sx-1,sy-r,sx-1,sy-r-2);
}
void drawZ(int r,int c,int sz){
  if(r<ZONE_Y || r+sz+1>=64) return;
  SL(c,r,    c+sz,r);    SL(c,r+1,  c+sz,r+1);
  SL(c+sz,r+1,c, r+sz-1);
  SL(c,r+sz, c+sz,r+sz); SL(c,r+sz+1,c+sz,r+sz+1);
}

// =========================================================
// SET EMOTION TARGETS
// =========================================================
void setTargets(int e){
  switch(e){
    case E_HAPPY:
      tEye=1.0f; tBrow=0.5f; tCheek=1.0f; tSweat=0.0f; tZzz=0.0f; break;
    case E_THIRSTY:
      tEye=0.8f; tBrow=-0.4f; tCheek=0.0f; tSweat=0.0f; tZzz=0.0f; break;
    case E_SLEEPY:
      tEye=0.1f; tBrow=0.0f; tCheek=0.0f; tSweat=0.0f; tZzz=1.0f; break;
    case E_STRESSED:
      tEye=1.0f; tBrow=-1.0f; tCheek=0.0f; tSweat=1.0f; tZzz=0.0f; break;
  }
}

void doTween(){
  sEye   = lp(sEye,   tEye,   0.11f);
  sBrow  = lp(sBrow,  tBrow,  0.11f);
  sCheek = lp(sCheek, tCheek, 0.16f);
  sSweat = lp(sSweat, tSweat, 0.11f);
  sZzz   = lp(sZzz,   tZzz,   0.11f);
}

// =========================================================
// SENSOR READING + EMOTION DECISION
// =========================================================
void readSensors(){
  sens.soilRaw = analogRead(SOIL_PIN);
  sens.soilPct = constrain(map(sens.soilRaw, SOIL_DRY, SOIL_WET, 0, 100), 0, 100);
  sens.ldr1    = digitalRead(LDR1_PIN);
  sens.ldr2    = digitalRead(LDR2_PIN);

  if(sens.ldr1==sens.ldr2)
    sens.lightState = (sens.ldr1==LOW) ? "BRIGHT" : "DARK";
  else
    sens.lightState = "MIXED";

  float h=dht.readHumidity(), t=dht.readTemperature();
  if(!isnan(h) && !isnan(t)){
    sens.dhtOk=true; sens.humidity=h; sens.temperature=t;
  } else {
    sens.dhtOk=false;
  }
  sens.ts = millis();

  int newEmo;
  if      (sens.soilPct < 30)                    newEmo = E_THIRSTY;
  else if (sens.dhtOk && sens.temperature > 35)  newEmo = E_STRESSED;
  else if (sens.lightState == "DARK")           newEmo = E_SLEEPY;
  else                                            newEmo = E_HAPPY;

  if(newEmo != curEmo){
    curEmo = newEmo;
    setTargets(curEmo);
    phTear = 0.0f;
    Serial.printf("[Emotion] -> %s\n",
      curEmo==E_HAPPY?"HAPPY":curEmo==E_THIRSTY?"THIRSTY":
      curEmo==E_SLEEPY?"SLEEPY":"STRESSED");
  }
}

// =========================================================
// JSON FOR API
// =========================================================
String sensorsJson(){
  StaticJsonDocument<640> doc;

  // Frontend expected keys
  doc["moisture"] = sens.soilPct;
  doc["light"]    = estimatedLux();
  if(sens.dhtOk) {
    doc["temperature"] = sens.temperature;
    doc["humidity"]    = sens.humidity;
  } else {
    doc["temperature"] = nullptr;
    doc["humidity"]    = nullptr;
  }

  // Keep detailed/base fields too
  doc["soil_moisture"]         = sens.soilRaw;
  doc["soil_moisture_percent"] = sens.soilPct;
  doc["ldr1_do"]               = sens.ldr1;
  doc["ldr2_do"]               = sens.ldr2;
  doc["light_state"]           = sens.lightState;
  doc["emotion"]               = (curEmo==E_HAPPY?"happy":
                                  curEmo==E_THIRSTY?"thirsty":
                                  curEmo==E_SLEEPY?"sleepy":"stressed");
  doc["wifi_connected"]        = (WiFi.status()==WL_CONNECTED);
  doc["ip"]                    = (WiFi.status()==WL_CONNECTED) ? WiFi.localIP().toString() : "disconnected";
  doc["ts"]                    = sens.ts;

  String out;
  serializeJson(doc, out);
  return out;
}

// =========================================================
// API SETUP
// =========================================================
void setupApi(){
  // Global CORS defaults for all responses.
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");

  server.on("/", HTTP_GET, [](AsyncWebServerRequest* req){
    StaticJsonDocument<192> d;
    d["service"] = "emotion-plant-pot";
    d["ok"] = true;
    d["endpoints"][0] = "/health";
    d["endpoints"][1] = "/sensors";
    d["endpoints"][2] = "/telemetry";
    String out; serializeJson(d, out);
    AsyncWebServerResponse* res = req->beginResponse(200,"application/json",out);
    addCorsHeaders(res);
    req->send(res);
  });

  server.on("/health", HTTP_OPTIONS, [](AsyncWebServerRequest* req){ sendCorsPreflight(req); });
  server.on("/sensors", HTTP_OPTIONS, [](AsyncWebServerRequest* req){ sendCorsPreflight(req); });
  server.on("/telemetry", HTTP_OPTIONS, [](AsyncWebServerRequest* req){ sendCorsPreflight(req); });

  server.on("/health", HTTP_GET, [](AsyncWebServerRequest* req){
    StaticJsonDocument<160> d;
    d["ok"] = true;
    d["ip"] = (WiFi.status()==WL_CONNECTED) ? WiFi.localIP().toString() : "connecting";
    d["wifi_connected"] = (WiFi.status()==WL_CONNECTED);
    String out; serializeJson(d, out);

    AsyncWebServerResponse* res = req->beginResponse(200,"application/json",out);
    addCorsHeaders(res);
    req->send(res);
  });

  auto sendSensors = [](AsyncWebServerRequest* req){
    AsyncWebServerResponse* res = req->beginResponse(200,"application/json",sensorsJson());
    addCorsHeaders(res);
    req->send(res);
  };

  server.on("/sensors",   HTTP_GET, sendSensors);
  server.on("/telemetry", HTTP_GET, sendSensors);

  server.begin();
  Serial.println("[API] Server started on port 80");
}

// =========================================================
// RENDER FRAME
// =========================================================
void renderFrame(uint32_t now){
  float dt = 1.0f / FPS;
  phBreathe += dt * 1.6f;
  phWobble  += dt * 8.0f;

  if(!blinking && (now-lastBlinkAt)>nextBlink){
    blinking=true; phBlink=0; lastBlinkAt=now;
    nextBlink = 2200+random(3000);
  }
  if(blinking){
    phBlink += dt*12.0f;
    if     (phBlink<1.0f) blinkAmt=1.0f-phBlink;
    else if(phBlink<2.0f) blinkAmt=phBlink-1.0f;
    else { blinkAmt=1.0f; blinking=false; }
  }

  if(curEmo==E_THIRSTY){ phTear+=dt*0.4f; if(phTear>1.0f) phTear=0.0f; }
  else phTear=0.0f;

  if(curEmo==E_SLEEPY){ phZzz+=dt*0.5f; if(phZzz>=1.0f) phZzz-=1.0f; }

  if(curEmo==E_STRESSED){
    if(now>nextShake){
      shakeX=(random(9)-4)*0.8f; shakeY=(random(7)-3)*0.5f;
      nextShake=now+60+random(100);
    }
    shakeX=lp(shakeX,0.0f,0.3f); shakeY=lp(shakeY,0.0f,0.3f);
  } else { shakeX=0; shakeY=0; }

  int   cx  = FCX+(int)shakeX;
  int   cy  = FCY+(int)shakeY;
  int   cr  = FCR+(curEmo==E_HAPPY?(int)(sinf(phBreathe)*1.2f):0);
  float eff = cf(sEye*blinkAmt, 0.0f, 1.0f);
  int   elx = cx-11, erx=cx+11, eyy=cy-6;

  oled.clearDisplay();

  oled.setTextSize(1);
  oled.setTextColor(WHITE);
  oled.setCursor(4,4);
  const char* lbl[]={"HAPPY   :)","THIRSTY :(","SLEEPY  zz","STRESSED!"};
  oled.print(lbl[curEmo]);

  SC(cx,cy,cr); SC(cx,cy,cr-1);

  browDraw(elx,eyy,sBrow,true);
  browDraw(erx,eyy,sBrow,false);

  eyeDraw(elx,eyy,eff,curEmo,true);
  eyeDraw(erx,eyy,eff,curEmo,false);

  int mx=cx, my=cy+10;
  switch(curEmo){
    case E_HAPPY:
      mouthSmile(mx,my, sBrow>0.4f);
      break;
    case E_THIRSTY:
      if(phTear>0.5f) mouthOpenSad(mx,my);
      else            mouthFrown(mx,my);
      break;
    case E_SLEEPY:
      mouthYawn(mx,my);
      break;
    case E_STRESSED:
      mouthWavy(mx,my,phWobble);
      break;
  }

  if(sCheek>0.05f) drawCheeks();

  if(curEmo==E_THIRSTY) drawTear(phTear);

  if(curEmo==E_STRESSED && sSweat>0.1f){
    float pulse=1.0f+sinf(phBreathe*3.0f)*0.2f;
    drawSweat(sSweat*pulse);
  }

  if(curEmo==E_SLEEPY && sZzz>0.15f){
    float rng=7.0f;
    drawZ((cy-cr+4)+(int)(phZzz*rng),                      cx+cr,   4);
    drawZ((cy-cr)  +(int)(fmod(phZzz+0.35f,1.0f)*rng),    cx+cr+4, 5);
    drawZ((cy-cr-7)+(int)(fmod(phZzz+0.65f,1.0f)*rng),    cx+cr+2, 5);
  }

  oled.display();
}

// =========================================================
// SETUP
// =========================================================
void setup(){
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[Boot] Emotional Plant Pot starting...");

  pinMode(SOIL_PIN,  INPUT);
  pinMode(LDR1_PIN,  INPUT);
  pinMode(LDR2_PIN,  INPUT);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  dht.begin();
  Serial.println("[DHT] Initialized");

  Wire.begin(OLED_SDA, OLED_SCL);
  if(!oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)){
    Serial.println("[OLED] FAILED - check wiring!");
  } else {
    Serial.println("[OLED] OK");
    oled.clearDisplay();
    oled.setTextColor(WHITE);
    oled.setTextSize(1);
    oled.setCursor(10,20);
    oled.println("Connecting WiFi...");
    oled.display();
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Connecting");
  uint32_t wStart = millis();
  while(WiFi.status()!=WL_CONNECTED && millis()-wStart<12000){
    Serial.print(".");
    delay(300);
  }
  Serial.println();

  if(WiFi.status()==WL_CONNECTED){
    Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    if(oled.width() > 0) {
      oled.clearDisplay();
      oled.setCursor(4,20);
      oled.printf("IP: %s", WiFi.localIP().toString().c_str());
      oled.display();
      delay(1500);
    }
  } else {
    Serial.println("[WiFi] Failed - running offline");
  }

  setupApi();

  curEmo = E_HAPPY;
  setTargets(curEmo);
  sEye=1.0f; sBrow=0.5f; sCheek=1.0f;
  lastBlinkAt = millis() + 2000;

  readSensors();
  Serial.println("[Boot] Ready!");
}

// =========================================================
// LOOP
// =========================================================
void loop(){
  uint32_t now = millis();

  if(now - lastWifi > 5000){
    lastWifi = now;
    if(WiFi.status()!=WL_CONNECTED) {
      WiFi.reconnect();
      Serial.println("[WiFi] Reconnecting...");
    }
  }

  if(now - lastSensor > 2000){
    lastSensor = now;
    readSensors();
  }

  if(now - lastFrame >= (1000/FPS)){
    lastFrame = now;
    doTween();
    renderFrame(now);
  }
}
