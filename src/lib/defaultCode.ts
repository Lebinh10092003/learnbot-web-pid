export const defaultCode = `#include <Leanbot.h>

void setup() {
  Leanbot.begin();
}

void loop() {
  LbMission.begin(TB1A + TB1B);

  // Đi thẳng 300 mm
  LbMotion.runLR(1000, 1000);
  LbMotion.waitDistanceMm(300);
  LbMotion.stopAndWait();

  // Nếu vật cản gần hơn 20 cm thì báo bằng LED
  if (Leanbot.pingCm() < 20) {
    LbRGB[ledO] = CRGB::Red;
    LbRGB.show();
    Leanbot.tone(1200, 160);
    LbDelay(160);
  }

  // Quay phải 90 độ
  LbMotion.runLR(650, -650);
  LbMotion.waitRotationDeg(90);
  LbMotion.stopAndWait();

  LbMission.end();
}
`
