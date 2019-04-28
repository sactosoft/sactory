var Factory = require("../..");

module.exports = function(app){

	app.get("/user/:username", function(req, res){
		
		var user = {
			name: "Mark White",
			
		};
	
		@ = Factory.createDocument();
		
		<html lang="en">
			<head>
				<title @text=user.name />
				<script>
					window.addEventListener("load", function(){
						console.log("Current user: $user.name");
					});
				</script>
				<style>
					body {
						margin: 0;
						padding: 0;
					}
					.name {
						margin: 0;
					}
				</style>
			</head>
			<body>
				<h3 class="name" style="color:#333" @style.font-size="44px" @text=user.name />
				<div #html>
					<style scoped>
						&, * {
							background: black;
							color: white;
						}
					</style>
					This user is $user.name
				</div>
			</body>
		</html>
		
		res.send(@toString());
	
	});

};
