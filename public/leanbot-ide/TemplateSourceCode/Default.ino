#include <Leanbot.h>                    // use Leanbot library


void setup() {
  Leanbot.begin();                      // initialize Leanbot
}


void loop() {
  LbMission.begin( TB1A + TB1B );       // start mission when both TB1A and TB1B touched

  // Your code here
  
  LbMission.end();                      // stop, finish mission
}