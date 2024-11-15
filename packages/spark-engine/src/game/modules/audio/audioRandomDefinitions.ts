import {
  random_synth_beep,
  random_synth_blip,
  random_synth_boom,
  random_synth_clack,
  random_synth_coin,
  random_synth_hurt,
  random_synth_jump,
  random_synth_lose,
  random_synth_powerup,
  random_synth_push,
  random_synth,
  random_synth_snap,
  random_synth_tap,
  random_synth_zap,
} from "./constructors/random_synth";

export const audioRandomDefinitions = () => ({
  synth: {
    $random: random_synth(),
    "$random:coin": random_synth_coin(),
    "$random:jump": random_synth_jump(),
    "$random:powerup": random_synth_powerup(),
    "$random:lose": random_synth_lose(),
    "$random:zap": random_synth_zap(),
    "$random:hurt": random_synth_hurt(),
    "$random:boom": random_synth_boom(),
    "$random:push": random_synth_push(),
    "$random:blip": random_synth_blip(),
    "$random:beep": random_synth_beep(),
    "$random:tap": random_synth_tap(),
    "$random:snap": random_synth_snap(),
    "$random:clack": random_synth_clack(),
  } as Record<string, ReturnType<typeof random_synth>>,
});