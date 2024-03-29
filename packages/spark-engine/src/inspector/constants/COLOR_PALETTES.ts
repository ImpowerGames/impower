/*
 * Based on svelte-svg-patterns <https://github.com/catchspider2002/svelte-svg-patterns>
 *
 * Copyright (c) 2021 pattern.monster
 * Released under the MIT license.
 *
 * Website: https://pattern.monster
 */

export const COLOR_PALETTES = [
  ["#44337A", "#FFC800", "#FFFFFF", "#FF0054", "#00A878"],
  ["#2A2A30", "#616161", "#9e9e9e", "#e0e0e0", "#f5f5f5"],
  ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51"],
  ["#E63946", "#F1FAEE", "#A8DADC", "#457B9D", "#1D3557"],
  ["#FFCDB2", "#FFB4A2", "#E5989B", "#B5838D", "#6D6875"],
  ["#CB997E", "#EDDCD2", "#FFF1E6", "#F0EFEB", "#DDBEA9"],
  ["#003049", "#D62828", "#F77F00", "#FCBF49", "#EAE2B7"],
  ["#000000", "#14213D", "#FCA311", "#E5E5E5", "#FFFFFF"],
  ["#FFADAD", "#FFD6A5", "#FDFFB6", "#CAFFBF", "#9BF6FF"],
  ["#03045E", "#023E8A", "#0077B6", "#0096C7", "#00B4D8"],
  ["#2B2D42", "#8D99AE", "#EDF2F4", "#EF233C", "#D90429"],
  ["#05668D", "#028090", "#00A896", "#02C39A", "#F0F3BD"],
  ["#03071E", "#370617", "#6A040F", "#9D0208", "#D00000"],
  ["#FFB5A7", "#FCD5CE", "#F8EDEB", "#F9DCC4", "#FEC89A"],
  ["#D8E2DC", "#FFE5D9", "#FFCAD4", "#F4ACB7", "#9D8189"],
  ["#EF476F", "#FFD166", "#06D6A0", "#118AB2", "#073B4C"],
  ["#606C38", "#283618", "#FEFAE0", "#DDA15E", "#BC6C25"],
  ["#011627", "#FDFFFC", "#2EC4B6", "#E71D36", "#FF9F1C"],
  ["#FFBE0B", "#FB5607", "#FF006E", "#8338EC", "#3A86FF"],
  ["#7400B8", "#6930C3", "#5E60CE", "#5390D9", "#4EA8DE"],
  ["#006D77", "#83C5BE", "#EDF6F9", "#FFDDD2", "#E29578"],
  ["#1A535C", "#4ECDC4", "#F7FFF7", "#FF6B6B", "#FFE66D"],
  ["#3D5A80", "#98C1D9", "#E0FBFC", "#EE6C4D", "#293241"],
  ["#F6BD60", "#F7EDE2", "#F5CAC3", "#84A59D", "#F28482"],
  ["#FFA69E", "#FAF3DD", "#B8F2E6", "#AED9E0", "#5E6472"],
  ["#EDC4B3", "#E6B8A2", "#DEAB90", "#D69F7E", "#CD9777"],
  ["#22223B", "#4A4E69", "#9A8C98", "#C9ADA7", "#F2E9E4"],
  ["#F94144", "#F3722C", "#F8961E", "#F9C74F", "#90BE6D"],
  ["#FF9F1C", "#FFBF69", "#FFFFFF", "#CBF3F0", "#2EC4B6"],
  ["#D8F3DC", "#B7E4C7", "#95D5B2", "#74C69D", "#52B788"],
  ["#CAD2C5", "#84A98C", "#52796F", "#354F52", "#2F3E46"],
  ["#5F0F40", "#9A031E", "#FB8B24", "#E36414", "#0F4C5C"],
  ["#555B6E", "#89B0AE", "#BEE3DB", "#FAF9F9", "#FFD6BA"],
  ["#355070", "#6D597A", "#B56576", "#E56B6F", "#EAAC8B"],
  ["#247BA0", "#70C1B3", "#B2DBBF", "#F3FFBD", "#FF1654"],
  ["#8E9AAF", "#CBC0D3", "#EFD3D7", "#FEEAFA", "#DEE2FF"],
  ["#FFCBF2", "#F3C4FB", "#ECBCFD", "#E5B3FE", "#E2AFFF"],
  ["#ECF8F8", "#EEE4E1", "#E7D8C9", "#E6BEAE", "#B2967D"],
  ["#335C67", "#FFF3B0", "#E09F3E", "#9E2A2B", "#540B0E"],
  ["#F72585", "#7209B7", "#3A0CA3", "#4361EE", "#4CC9F0"],
  ["#F08080", "#F4978E", "#F8AD9D", "#FBC4AB", "#FFDAB9"],
  ["#7BDFF2", "#B2F7EF", "#EFF7F6", "#F7D6E0", "#F2B5D4"],
  ["#50514F", "#F25F5C", "#FFE066", "#247BA0", "#70C1B3"],
  ["#007F5F", "#2B9348", "#55A630", "#80B918", "#AACC00"],
  ["#F8F9FA", "#E9ECEF", "#DEE2E6", "#CED4DA", "#ADB5BD"],
  ["#283D3B", "#197278", "#EDDDD4", "#C44536", "#772E25"],
  ["#9C89B8", "#F0A6CA", "#EFC3E6", "#F0E6EF", "#B8BEDD"],
  ["#FFFFFF", "#84DCC6", "#A5FFD6", "#FFA69E", "#FF686B"],
  ["#CFDBD5", "#E8EDDF", "#F5CB5C", "#242423", "#333533"],
  ["#03045E", "#0077B6", "#00B4D8", "#90E0EF", "#CAF0F8"],
  ["#0B132B", "#1C2541", "#3A506B", "#5BC0BE", "#6FFFE9"],
  ["#0466C8", "#0353A4", "#023E7D", "#002855", "#001845"],
  ["#9B5DE5", "#F15BB5", "#FEE440", "#00BBF9", "#00F5D4"],
  ["#FFFFFF", "#00171F", "#003459", "#007EA7", "#00A8E8"],
  ["#588B8B", "#FFFFFF", "#FFD5C2", "#F28F3B", "#C8553D"],
  ["#FE938C", "#E6B89C", "#EAD2AC", "#9CAFB7", "#4281A4"],
  ["#2D00F7", "#6A00F4", "#8900F2", "#A100F2", "#B100E8"],
  ["#353535", "#3C6E71", "#FFFFFF", "#D9D9D9", "#284B63"],
  ["#C9CBA3", "#FFE1A8", "#E26D5C", "#723D46", "#472D30"],
  ["#463F3A", "#8A817C", "#BCB8B1", "#F4F3EE", "#E0AFA0"],
  ["#8ECAE6", "#219EBC", "#023047", "#FFB703", "#FB8500"],
  ["#10002B", "#240046", "#3C096C", "#5A189A", "#7B2CBF"],
  ["#E2E2DF", "#D2D2CF", "#E2CFC4", "#F7D9C4", "#FAEDCB"],
  ["#FF595E", "#FFCA3A", "#8AC926", "#1982C4", "#6A4C93"],
  ["#390099", "#9E0059", "#FF0054", "#FF5400", "#FFBD00"],
  ["#F94144", "#F3722C", "#F8961E", "#F9844A", "#F9C74F"],
  ["#F7B267", "#F79D65", "#F4845F", "#F27059", "#F25C54"],
  ["#70D6FF", "#FF70A6", "#FF9770", "#FFD670", "#E9FF70"],
  ["#FADDE1", "#FFC4D6", "#FFA6C1", "#FF87AB", "#FF5D8F"],
  ["#D4E09B", "#F6F4D2", "#CBDFBD", "#F19C79", "#A44A3F"],
  ["#220901", "#621708", "#941B0C", "#BC3908", "#F6AA1C"],
  ["#FFFCF2", "#CCC5B9", "#403D39", "#252422", "#EB5E28"],
  ["#ED6A5A", "#F4F1BB", "#9BC1BC", "#5CA4A9", "#E6EBE0"],
  ["#114B5F", "#1A936F", "#88D498", "#C6DABF", "#F3E9D2"],
  ["#540D6E", "#EE4266", "#FFD23F", "#3BCEAC", "#0EAD69"],
  ["#CB997E", "#DDBEA9", "#FFE8D6", "#B7B7A4", "#A5A58D"],
  ["#6F1D1B", "#BB9457", "#432818", "#99582A", "#FFE6A7"],
  ["#233D4D", "#FE7F2D", "#FCCA46", "#A1C181", "#619B8A"],
  ["#FFAC81", "#FF928B", "#FEC3A6", "#EFE9AE", "#CDEAC0"],
  ["#4F000B", "#720026", "#CE4257", "#FF7F51", "#FF9B54"],
  ["#64A6BD", "#90A8C3", "#ADA7C9", "#D7B9D5", "#F4CAE0"],
  ["#5BC0EB", "#FDE74C", "#9BC53D", "#E55934", "#FA7921"],
  ["#0D3B66", "#FAF0CA", "#F4D35E", "#EE964B", "#F95738"],
  ["#CDB4DB", "#FFC8DD", "#FFAFCC", "#BDE0FE", "#A2D2FF"],
  ["#EEE2DF", "#EED7C5", "#C89F9C", "#C97C5D", "#B36A5E"],
  ["#797D62", "#9B9B7A", "#D9AE94", "#F1DCA7", "#FFCB69"],
  ["#DCDCDD", "#C5C3C6", "#46494C", "#4C5C68", "#1985A1"],
  ["#BCE784", "#5DD39E", "#348AA7", "#525174", "#513B56"],
  ["#FF99C8", "#FCF6BD", "#D0F4DE", "#A9DEF9", "#E4C1F9"],
  ["#ECC8AF", "#E7AD99", "#CE796B", "#C18C5D", "#495867"],
  ["#0D1B2A", "#1B263B", "#415A77", "#778DA9", "#E0E1DD"],
  ["#FF4800", "#FF5400", "#FF6000", "#FF6D00", "#FF7900"],
  ["#2D3142", "#4F5D75", "#BFC0C0", "#FFFFFF", "#EF8354"],
  ["#495867", "#577399", "#BDD5EA", "#F7F7FF", "#FE5F55"],
  ["#2D3142", "#BFC0C0", "#FFFFFF", "#EF8354", "#4F5D75"],
  ["#FE4A49", "#2AB7CA", "#FED766", "#E6E6EA", "#F4F4F8"],
  ["#EEE3E7", "#EAD5DC", "#EEC9D2", "#F4B6C2", "#F6ABB6"],
  ["#011F4B", "#03396C", "#005B96", "#6497B1", "#B3CDE0"],
  ["#051E3E", "#251E3E", "#451E3E", "#651E3E", "#851E3E"],
  ["#DEC3C3", "#E7D3D3", "#F0E4E4", "#F9F4F4", "#FFFFFF"],
  ["#4A4E4D", "#0E9AA7", "#3DA4AB", "#F6CD61", "#FE8A71"],
  ["#2A4D69", "#4B86B4", "#ADCBE3", "#E7EFF6", "#63ACE5"],
  ["#FE9C8F", "#FEB2A8", "#FEC8C1", "#FAD9C1", "#F9CAA7"],
  ["#009688", "#35A79C", "#54B2A9", "#65C3BA", "#83D0C9"],
  ["#EE4035", "#F37736", "#FDF498", "#7BC043", "#0392CF"],
  ["#FFFFFF", "#D0E1F9", "#4D648D", "#283655", "#1E1F26"],
  ["#EEEEEE", "#DDDDDD", "#CCCCCC", "#BBBBBB", "#AAAAAA"],
  ["#FFE9DC", "#FCE9DB", "#E0A899", "#DFA290", "#C99789"],
  ["#96CEB4", "#FFEEAD", "#FF6F69", "#FFCC5C", "#88D8B0"],
  ["#6E7F80", "#536872", "#708090", "#536878", "#36454F"],
  ["#4B3832", "#854442", "#FFF4E6", "#3C2F2F", "#BE9B7B"],
  ["#3B5998", "#8B9DC3", "#DFE3EE", "#F7F7F7", "#FFFFFF"],
  ["#008744", "#0057E7", "#D62D20", "#FFA700", "#FFFFFF"],
  ["#3385C6", "#4279A3", "#476C8A", "#49657B", "#7F8E9E"],
  ["#D2D4DC", "#AFAFAF", "#F8F8FA", "#E5E6EB", "#C0C2CE"],
  ["#A8E6CF", "#DCEDC1", "#FFD3B6", "#FFAAA5", "#FF8B94"],
  ["#D11141", "#00B159", "#00AEDB", "#F37735", "#FFC425"],
  ["#6F7C85", "#75838D", "#7E8D98", "#8595A1", "#8C9DA9"],
  ["#EBF4F6", "#BDEAEE", "#76B4BD", "#58668B", "#5E5656"],
  ["#FF77AA", "#FF99CC", "#FFBBEE", "#FF5588", "#FF3377"],
  ["#EEEEEE", "#DDDDDD", "#CCCCCC", "#BBBBBB", "#29A8AB"],
  ["#FFF6E9", "#E3F0FF", "#D2E7FF", "#FFEFD7", "#FFFEF9"],
  ["#EDC951", "#EB6841", "#CC2A36", "#4F372D", "#00A0B0"],
  ["#84C1FF", "#ADD6FF", "#D6EAFF", "#EAF4FF", "#F8FBFF"],
  ["#2E003E", "#3D2352", "#3D1E6D", "#8874A3", "#E4DCF1"],
  ["#8D5524", "#C68642", "#E0AC69", "#F1C27D", "#FFDBAC"],
  ["#343D46", "#4F5B66", "#65737E", "#A7ADBA", "#C0C5CE"],
  ["#BFD6F6", "#8DBDFF", "#64A1F4", "#4A91F2", "#3B7DD8"],
  ["#E3C9C9", "#F4E7E7", "#EEDBDB", "#CECBCB", "#CBDADB"],
  ["#01BF2B", "#F04554", "#EFF9FB", "#5A3626", "#290B0A"],
  ["#F0F4F7", "#C8BEB9", "#FAC57D", "#A81817", "#344D2F"],
] as const;
