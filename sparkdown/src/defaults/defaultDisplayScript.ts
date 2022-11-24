export const defaultDisplayScript = `
@ ui Display:
  Background
  Portrait
  ChoiceGroup:
    Choices:
      Choice
  Box:
    Content:
      Indicator = "▼"
      DescriptionGroup:
        DescriptionBox:
          DescriptionContent:
            Action
            Centered
            Transition
            Scene
      DialogueGroup:
        Character
        DialogueContent:
          Parenthetical
          Dialogue

@ style Background:
  position = "absolute"
  top = 0
  right = 0
  bottom = 0
  left = 0
  backgroundPosition = "center"
  backgroundSize = "cover"

@ style Portrait:
  position = "absolute"
  top = "10%"
  right = 0
  bottom = 0
  left = 0
  display = "flex"
  flexDirection = "column"

@ style ChoiceGroup:
  position = "relative"
  flex = 1
  display = "flex"
  flexDirection = "column"
  alignItems = "center"
  justifyContent = "center"
  fontSize = "1rem"
  md:
    fontSize = "1.125rem"

@ style Choices:
  display = "flex"
  flexDirection = "column"
  paddingLeft = "10%"
  paddingRight = "10%"

@ style Choice:
  backgroundColor = "white"
  padding = 8

@ style Box:
  position = "relative"
  display = "flex"
  flexDirection = "column"
  maxWidth = 800
  height = 224
  width = "100%"
  margin = "0 auto"
  backgroundColor = "white"

@ style Content:
  flex = 1
  display = "flex"
  flexDirection = "column"
  alignContent = "center"
  position = "absolute"
  top = 0
  bottom = 0
  left = 0
  right = 0
  paddingTop = 16
  paddingBottom = 16
  paddingLeft = 16
  paddingRight = 16
  fontSize = "1rem"
  md:
    paddingLeft = 32
    paddingRight = 32
    fontSize = "1.125rem"

@ style Indicator:
  width = 16
  height = 16
  position = "absolute"
  right = 16
  bottom = 16
  animation = "0.25s ease infinite alternate SlideUp"
  animationPlayState = "paused"

@ style DescriptionGroup:
  width = "100%"
  height = "100%"

@ style DescriptionBox:
  display = "flex"
  flexDirection = "column"
  alignItems = "center"
  justifyContent = "center"
  height = "100%"
  width = "100%"

@ style DescriptionContent:
  display = "flex"
  flexDirection = "column"
  alignItems = "center"
  width = "100%"
  maxWidth = 640

@ style Centered:
  textAlign = "center"

@ style Transition:
  textAlign = "right"
  width = "100%"

@ style Scene:
  textAlign = "center"
  fontWeight = "bold"

@ style DialogueGroup:
  flex = 1

@ style DialogueContent:
  flex = 1
  paddingTop = 16
  paddingBottom = 16
  width = "80%"
  margin = "0 auto"
  md:
    width = "68%"

@ style Character:
  lineHeight = 1
  fontSize = "1.5rem"
  textAlign = "center"
  md:
    fontSize = "1.75rem"

@ style Parenthetical:
  textAlign = "center"

@ style Dialogue:
  flex = 1

@ animation SlideUp:
  from:
    transform = "translateY(0%)"
  to:
    transform = "translateY(-50%)"
`;
