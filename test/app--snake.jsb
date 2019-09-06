const UP = 1;
const RIGHT = 2;
const DOWN = 3;
const LEFT = 4;

var score = &0;
var speed = 500;

var data = [];
var positions = [];
var direction = RIGHT;
var next;

for(var i=0; i<30; i++) {
	var row = [];
	for(var j=0; j<30; j++) {
		row.push(&0);
	}
	data.push(row);
}

// register commands
document.$$on("keydown:key.arrowup:prevent", () => next = UP);
document.$$on("keydown:key.arrowright:prevent", () => next = RIGHT);
document.$$on("keydown:key.arrowdown:prevent", () => next = DOWN);
document.$$on("keydown:key.arrowleft:prevent", () => next = LEFT);

function fruit() {
	var row = data[Math.floor(Math.random() * data.length)];
	var cell = row[Math.floor(Math.random() * row.length)];
	if(*cell == 0) {
		*cell = 2 + Math.floor(Math.random() * 3);
	} else {
		fruit();
	}
}

function tick() {
	var [i, j] = positions[0];
	if(next && Math.abs(direction - next) != 2) direction = next;
	switch(direction) {
		case UP:
			i--;
			break;
		case RIGHT:
			j++;
			break;
		case DOWN:
			i++;
			break;
		case LEFT:
			j--;
			break;
	}
	var row = data[i];
	if(row) {
		var cell = row[j];
		if(cell) {
			if(*cell != 1) {
				if(*cell == 0) {
					var [pi, pj] = positions.pop();
					*(data[pi][pj]) = 0;
				} else {
					fruit();
					*score++;
					speed = speed / 5 * 4;
				}
				*cell = 1;
				positions.unshift([i, j]);
				setTimeout(tick, speed);
			}
		}
	}
}

// init game
positions.push([15, 16], [15, 15], [15, 14]);
positions.forEach(([i, j]) => *(data[i][j]) = 1);
fruit();
fruit();
fruit();
tick();

<:this>
	<style :scoped>
		table {
			border: 1px solid silver;
			td {
				width, height: 8px;
				padding: 0;
				&[data-type='1'] < background: black;
				&[data-type='2'] < background: blue;
				&[data-type='3'] < background: green;
				&[data-type='4'] < background: purple;
			}
		}
	</style>
	Score: ${*score}
	<hr />
	<table>
		foreach(data as row) {
			<tr>
				foreach(row as cell) {
					<td data-type=*cell />
				}
			</tr>
		}
	</table>
</:this>
