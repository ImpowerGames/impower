$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $speaker.Volume = [int]$payload.volume
  $speaker.Rate = [int]$payload.rate
  $speaker.SetOutputToDefaultAudioDevice()
  $speaker.Speak([string]$payload.text)
} finally {
  $speaker.Dispose()
}
