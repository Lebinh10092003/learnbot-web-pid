/*Basic Leanbot Motion

  Wait for TB1A+TB1B touch signal, then go straight for 100 mm, then stop.

  More Leanbot examples at  https://git.pythaverse.space/leanbot/Examples
*/


#include <Leanbot.h>                    // use Leanbot library


void setup() {
  Leanbot.begin();                      // initialize Leanbot
}


void loop() {
  LbMission.begin( TB1A + TB1B );       // start mission when both TB1A and TB1B touched

  LbMotion.runLR( +1000, +1000 );       // go straight forward with speed 1000 steps/s
  LbMotion.waitDistanceMm( 100 );       // for 100 mm distance
  LbMotion.stopAndWait();               // stop, then wait until completely stopped

  LbMission.end();                      // stop, finish mission
}