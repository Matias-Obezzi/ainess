mkdir $env:TEMP\ais-p1 -ErrorAction SilentlyContinue
mkdir $env:TEMP\ais-p2 -ErrorAction SilentlyContinue
node bin/ais.js projects add p1 --dir $env:TEMP\ais-p1
node bin/ais.js projects list
node bin/ais.js -a Antigravity -w $env:TEMP\ais-p2 "Creá un archivo a.txt con el texto: proyecto dos"
type $env:TEMP\ais-p2\a.txt
node bin/ais.js projects list
