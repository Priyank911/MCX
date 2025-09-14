import { Empty, EmptyRequest } from "@shared/proto/cline/common"
import { getRequestRegistry, StreamingResponseHandler } from "../grpc-handler"
import { Controller } from "../index"

// Keep track of active pluginButtonClicked subscriptions by controller ID
const activePluginButtonClickedSubscriptions = new Map<string, StreamingResponseHandler<Empty>>()

/**
 * Subscribe to pluginButtonClicked events
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToPluginButtonClicked(
	controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<Empty>,
	requestId?: string,
): Promise<void> {
	const controllerId = controller.id
	console.log(`[DEBUG] set up pluginButtonClicked subscription for controller ${controllerId}`)

	// Add this subscription to the active subscriptions with the controller ID
	activePluginButtonClickedSubscriptions.set(controllerId, responseStream)

	// Register cleanup when the connection is closed
	const cleanup = () => {
		activePluginButtonClickedSubscriptions.delete(controllerId)
	}

	// Register the cleanup function with the request registry if we have a requestId
	if (requestId) {
		getRequestRegistry().registerRequest(requestId, cleanup, { type: "pluginButtonClicked_subscription" }, responseStream)
	}
}

/**
 * Send a pluginButtonClicked event to a specific controller's subscription
 * @param controllerId The ID of the controller to send the event to
 */
export async function sendPluginButtonClickedEvent(controllerId: string): Promise<void> {
	// Get the subscription for this specific controller
	const responseStream = activePluginButtonClickedSubscriptions.get(controllerId)

	if (!responseStream) {
		console.error(`[DEBUG] No active subscription for controller ${controllerId}`)
		return
	}

	try {
		const event = Empty.create({})
		await responseStream(
			event,
			false, // Not the last message
		)
	} catch (error) {
		console.error(`Error sending pluginButtonClicked event to controller ${controllerId}:`, error)
		// Remove the subscription if there was an error
		activePluginButtonClickedSubscriptions.delete(controllerId)
	}
}
