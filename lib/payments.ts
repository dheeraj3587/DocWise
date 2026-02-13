import Stripe from "stripe"

export const handleCheckoutSessionCompleted = async ({session}: {session: Stripe.Checkout.Session})=>{
    console.log("just checking")
}