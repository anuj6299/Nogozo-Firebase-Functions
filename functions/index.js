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

exports.registerShopInServiceArea = functions.https.onRequest((req, res) => {
	/*expected data
		serviceids = ["id1","id2", ...]
		areaids = ["id1", "id2", ....]
		shopId = string
		shopname = string
	*/
	var serviceids = req.body.data.serviceids;
	var areaids = req.body.data.areaids;
	var shopid = req.body.data.shopid;
	var shopname = req.body.data.shopname;

	var scheme = {};
	/*
	DATA SCHEME
	shop 
		serviceid
			areaid
				shopId = shopname

	*/

	//DO NOT USE HASHMAP USE PATH AS KEY
	for(let serviceid of serviceids){
		var areaScheme = {};
		for(let areaid of areaids){
			areaScheme[areaid] = {shopid: shopname};
		}
		scheme[serviceid] = areaScheme;
	}
	if(Object.keys(scheme).length != 0)
		admin.database().ref(`shops`).update(scheme);
});

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