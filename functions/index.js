const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.onOrderCreate = functions.database.ref('/orders/{orderid}')
.onCreate((snap, context) => {
	const orderid = context.params.orderid;
	const customerid = snap.child('customerid').val();
	const shopid = snap.child('shopid').val();

	admin.database().ref(`/users/customer/${customerid}/orders/${orderid}`).set('current');
	admin.database().ref(`/users/shop/${shopid}/orders/${orderid}`).set('current');
	sendNotification(shopid, "New Order", "New Order arrived!!");
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