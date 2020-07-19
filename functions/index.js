const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.onOrderCreate = functions.database.ref('/orders/{orderid}')
.onCreate((snap, context) => {
	const db = admin.database();

	const orderid = context.params.orderid;
	const customerid = snap.child('customerid').val();
	const shopid = snap.child('shopid').val();
	const shopname = snap.child('shopname').val();

	db.ref(`/users/customer/${customerid}/orders/${orderid}`).set('current');
	db.ref(`/users/shop/${shopid}/orders/${orderid}`).set('current');
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
		}else if(change.after._data.status == "1"){
			status = "Packed";
		}else if(change.after._data.status == "2"){
			status = "Out For Delivery";
		}else if(change.after._data.status == "3"){
			status = "Delivered";
			orderComplete(context.params.orderid, customerid, shopid, change.after._data.price, change.after._data.datetime);
		}
		sendNotification(customerid, "Order " + status, "Your Order from " + change.after._data.shopname + " is "+ status);
	}

});

function orderComplete(orderId, customerId, shopId, price, datetime){
	const db = admin.database();
	datetime = datetime.substring(0, 6);
	db.ref(`/users/customer/${customerId}/orders/${orderId}`).set('history');
	db.ref(`/users/shop/${shopId}/orders/${orderId}`).set('history');


	//UPDATING STATS FOR SHOP
	data = {};
	db.ref(`/users/shop/${shopId}/stats/${datetime}`).once('value', function(snapShot){
		if(snapShot.val() != null){
			var currentAmount = snapShot.child('total_amount').val();
			var currentOrders = snapShot.child('total_orders').val();
			if(currentAmount != null && currentAmount != undefined){
				const totalAmount = Number(currentAmount) + Number(price);
				data['total_amount'] = '' + totalAmount;
			}else{
				data['total_amount'] = '' + price;
			}
			if(currentOrders != null && currentOrders != undefined){
				const totalOrders = Number(currentOrders) + 1;
				data['total_orders'] = '' + totalOrders;
			}else{
				data['total_orders'] = '1';
			}
		}else{
			data['total_amount'] = '' + price;
			data['total_orders'] = '1';
		}
		db.ref(`/users/shop/${shopId}/stats/${datetime}`).set(data);
	});

	//ADD POINTS TO CUSTOMER PROFILE
	var walletPromise = db.ref(`/users/customer/${customerId}/wallet`).once('value');
	var walletPercentPromise = db.ref(`/wallet_percent`).once('value');

	Promise.all([walletPromise, walletPercentPromise]).then(results => {
		const currentWalletPoint = Number(results[0].val());
		const walletPercent = Number(results[1].val());
		if(currentWalletPoint == null || currentWalletPoint == undefined)
			currentWalletPoint = 0;

		const newWalletPoint = currentWalletPoint + walletPercent*Number(price)/100;
		db.ref(`/users/customer/${customerId}/wallet`).set(''+newWalletPoint);
	});
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

exports.fare = functions.https.onRequest((req, res) => {

	const item_total = req.body.data.itemprice;
	const cityId = req.body.data.cityid;
	const areaId = req.body.data.areaid;
	const shopAreaId = req.body.data.shopareaid;
	admin.database().ref(`/charges/${cityId}`).once('value', function(snap){
		var charges = {};
		var total = 0;

		charges["Delivery Charge"] = snap.child('base').val();
		total += Number(charges["Delivery Charge"]);

		if(shopAreaId != areaId){
			charges["Distance Charge"] = snap.child('distance').val();
			total += Number(charges["Distance Charge"]);
		}

		if(snap.child('extra') != null){
			charges[snap.child('extra').child('type').val()] = snap.child('extra').child('amount').val();
			total += Number(charges[snap.child('extra').child('type').val()]);
		}

		charges["total"] = ''+total;

		res.status(200).send({"data": charges});
		return {"data": charges};
	});
});

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
			});
		});
	});

});

//CREATE NEW USER
// exports.createUser = functions.https.onRequest((req, res) => {
// 	admin.auth().createUser({
// 		email: 'abc@email.com',
// 		password: 'password',
// 		disabld: false
// 	}).then(function(userResord){
// 		res.status(200).send({"data":{"uid": userRecord.uid}});
// 		return {"data":{"uid": userRecord.uid}};
// 	}).catch(function(error){
// 		resstatus(200).send({"data":{"error": error}});
// 		return {"data":{"error": error}};
// 	});
// });
//   email: 'user@example.com',
//   emailVerified: false,
//   phoneNumber: '+11234567890',
//   password: 'secretPassword',
//   displayName: 'John Doe',
//   photoURL: 'http://www.example.com/12345678/photo.png',
//   disabled: false