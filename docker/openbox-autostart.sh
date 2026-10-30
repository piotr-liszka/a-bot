# Shared desktop of the a-bot sandbox: light wallpaper, a dock at the bottom and the browser open.
xrdb -merge /usr/share/a-bot/desktop/Xresources
if command -v hsetroot >/dev/null; then
  hsetroot -add '#e4e9f5' -add '#f7f4ee' -gradient 160 &
else
  xsetroot -solid '#eef1f6' &
fi
command -v tint2 >/dev/null && tint2 -c /usr/share/a-bot/desktop/tint2rc &
(sleep 1 && browser about:blank) &
