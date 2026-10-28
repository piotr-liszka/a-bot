const stamp = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg: string) => console.log(`${stamp()}  ${msg}`),
  warn: (msg: string) => console.warn(`${stamp()}  ! ${msg}`),
  error: (msg: string) => console.error(`${stamp()}  ✗ ${msg}`),
};
