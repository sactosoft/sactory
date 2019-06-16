var fetch = require("node-fetch");

module.exports = function(app){
	
	var types = ["primary", "info", "success", "warning", "danger"];
	
	var theme = {
		margin: "10px",
		padding: "8px",
		dark: false,
		className: {
			name: "name"
		},
		color: {
			primary: ["lightblue", "blue", "darkblue"],
			info: ["lightcyan", "cyan", "darkcyan"],
			success: ["lightgreen", "green", "darkgreen"],
			warning: ["lightyellow", "yellow", "darkyellow"],
			danger: ["lightred", "red", "darkred"]
		}
	};

	app.get("/benchmark", function(req, res){

		console.time();

		@ = Sactory.createDocument();

		var value = **"test";

		<{document.documentElement} lang="en" #html>
			<:body>
				&#64;
				<input type="password" *form=value />
				&Delta;
				&ouml;
			</:body>
		</>

		*value = "changed";

		res.send(@.render());

		console.timeEnd();

	});
	
	app.get("/users", async function(req, res){
		
		fetch("https://reqres.in/api/users?page=1").then(data => data.json()).then(data => {

			console.time();
			
			@ = Sactory.createDocument();
			
			<:head>
				<title @textContent="Users" />
				<script>
					function bigger() {
						this.style.width = "256px";
					}
				</script>
			</:head>
			<:body>
				data.data.forEach(user => {
					<div class="user">
						<img class="avatar" src=user.avatar +click="bigger" />
						<a href=("/user/" + user.id) @textContent=(user.first_name + ' ' + user.last_name) />
					</div>
				});
			</:body>
			
			res.send(@.render());

			console.timeEnd();
			
		});
		
	});

	app.get("/user/:userId", async function(req, res){
		
		fetch("https://reqres.in/api/users/" + req.params.userId).then(data => data.json()).then(data => {
			
			var user = data.data;
	
			@ = Sactory.createDocument();
			
			<:head>
				<title @text=(user.first_name + ' ' + user.last_name) />
				<script>
					var user = ${JSON.stringify(user)};
					console.log("Current user: ", user);
					var ${'$'} = document.querySelector;
				</script>
				<style>
					@import test;
					:root {
						for(let type of types) {
							var color = theme.color[type];
							for(var i in color) {
								--color-${type}-${i}: ${color[i]};
							}
						}
					}
					body {
						margin: ${theme.margin} ${(theme.padding + 1) * (theme.margin / 2)};
						if(theme.padding) padding: ${theme.padding / 2};
						else padding: 0;
					}
					.${theme.className.name} {
						margin: 0;
					}
					.button {
						
						background: #eee;
						color: #333;
						border: none;
						
						for(let type of types) {
							var color = theme.color[type];
							&.${type} {
								background: ${color[1]};
								color: #fff;
								&:hover {
									background: ${color[2]};
								}
							}
						}
					}
				</style>
			</:head>
			<:body #html :logic>
				<img src=user.avatar alt="Avatar" />
				<h3 class="name" style="color:#333" @style.font-size="44px">
					&lt;${user.first_name} ${user.last_name}&gt;
				</h3>
				<div>
					<style :scoped>
						&, * {
							background: black;
							color: white;
						}
					</style>
					This user id is ${user.id}
				</div>
				for(let type of types) {
					<button class=("button " + type) @textContent=type />
				}
			</:body>
			
			res.send(@.render());
			
		});
	
	});

};
