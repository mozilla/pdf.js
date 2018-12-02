export default function isValidRotation(angle) {
  return Number.isInteger(angle) && angle % 90 === 0;
}
