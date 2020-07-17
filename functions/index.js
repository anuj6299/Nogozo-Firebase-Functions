const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.onOrderCreate = functions.database.ref('/orders/{orderid}')
.onCreate((snap, context) => {
	const orderid = context.params.orderid;
	const customerid = snap.child('customerid').val();
	const shopid = snap.child('shopid').val();
	const shopname = snap.child('shopname').val();

	admin.database().ref(`/users/customer/${customerid}/orders/${orderid}`).set('current');
	admin.database().ref(`/users/shop/${shopid}/orders/${orderid}`).set('current');
	sendNotification(shopid, "New Order", "New Order arrived.");
	sendNotification(customerid, "Order Booked", "Your order from " + shopname + " is booked");
});

exports.onOrderStatusChange = functions.database.ref('/orders/{orderid}')
.onUpdate((change, context) => {
	if(change.before._data.status != change.after._data.status){
		const customerid = change.after._data.customerid;
		const shopid = change.after._data.shopid;

		var status = ""
		if(change.after._data.status == "0"){
			status = "Booked";
		}
		else if(change.after._data.status == "1"){
			status = "Packed";
		}else if(change.after._data.status == "2"){
			status = "Out For Delivery";
		}else if(change.after._data.status == "3"){
			status = "Delivered";
			orderComplete(context.params.orderid, customerid, shopid);
		}
		sendNotification(customerid, "Order " + status, "Your Order from " + change.after._data.shopname + " is "+ status);
	}

});

function orderComplete(orderId, customerId, shopId){
	admin.database().ref(`/users/customer/${customerId}/orders/${orderId}`).set('history');
	admin.database().ref(`/users/shop/${shopId}/orders/${orderId}`).set('history');
}

function sendNotification(userid, titleString, messageString){

	const getTokenPromise = admin.database().ref(`/token/${userid}`).once('value');

	return Promise.all([getTokenPromise]).then(results => {
		const notificationToken = results[0].val();
		if(notificationToken != null){
			var message = {
				notification: {
           			title: titleString,
           			body: messageString
       			},
        		token: notificationToken
    		};
  		    admin.messaging().send(message);
		}
	});
}

exports.search = functions.https.onRequest((req, res) => {
	var db = admin.database();
	/*
	 * query, type=stirng, query-string 
	 * cityid, type=string, cityid of searched area;
	 */
	var query = req.body.data.query;
	const cityId = req.body.data.cityid;

	//var query = req.query.query;
	//const cityId = req.query.cityid;

	if(cityId == undefined){
		res.send({"data":{"error":"Provide cityid"}});
		return {"error":"Provide cityid"};
	}
	if(query == undefined || query.length == 0){
		res.send({"data":{"error":"Provide query"}});
		return {"data":{"error":"Provide query"}};
	}
	if(query == undefined || query.length < 4){
		res.send({"data":{"error":"Provide query of Length 4"}});
		return {"data":{"error":"Provide query of Length 4"}};
	}

	var shops = {};
	var counter = 0;
	query = query.toLowerCase();

	// db.ref('shops').child(cityId).once('value', function(snap){
	// 	const length = snap.numChildren();
	// 	snap.forEach(function(shop){
	// 		db.ref('items').child(shop.key).orderByChild('itemname').startAt(query).endAt(query+"\uf8ff").once('value', function(itemSnap){
	// 			if(itemSnap.numChildren() > 0){
	// 				shops[itemSnap.key] = shop.child("shopname").val();
	// 			}
	// 			counter++;
	// 			if(counter == length){
	// 				console.log({"data":shops});
	// 				res.status(200).send({"data":shops});
	// 				return {"data":shops};
	// 			}
	// 		});
	// 	});
	// });

	db.ref('shops').child(cityId).once('value', function(snap){
		const length = snap.numChildren();
		if(!snap.exists()){
			res.status(200).send({});
			return {};
		}else{

		}
		snap.forEach(function(shop){
			db.ref('items').child(shop.key).once('value', function(itemSnap){
				const data = itemSnap.toJSON();
				for(var item in data){
					if(data[item].itemname.toString().toLowerCase().includes(query)){
						shops[shop.key] = shop.child('shopname').val();
						break;
					}
				}
				counter++;
				if(counter == length){
					res.status(200).send({"data":shops});
					return {"data":shops};
				}

				// if(itemSnap.numChildren() > 0){
				// 	shops[itemSnap.key] = shop.child("shopname").val();
				// }
				// counter++;
				// if(counter == length){
				// 	console.log({"data":shops});
				// 	res.status(200).send({"data":shops});
				// 	return {"data":shops};
				// }
			});
		});
	});

});