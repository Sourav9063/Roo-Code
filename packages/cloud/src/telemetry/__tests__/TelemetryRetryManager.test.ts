import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest"
import { TelemetryRetryManager } from "../TelemetryRetryManager"
import { TelemetryEventName, TelemetryEvent } from "@roo-code/types"

// Mock TelemetryQueue
vi.mock("../TelemetryQueue")

describe("TelemetryRetryManager", () => {
	let mockQueue: {
		enqueue: Mock
		getEventsForRetry: Mock
		updateEventAfterRetry: Mock
		pruneFailedEvents: Mock
		getQueueMetadata: Mock
	}
	let retryManager: TelemetryRetryManager
	let sendEventMock: Mock
	let connectionStatusCallback: Mock
	let queueSizeCallback: Mock

	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()

		// Create mock queue
		mockQueue = {
			enqueue: vi.fn(),
			getEventsForRetry: vi.fn().mockResolvedValue([]),
			updateEventAfterRetry: vi.fn(),
			pruneFailedEvents: vi.fn().mockResolvedValue(0),
			getQueueMetadata: vi.fn().mockResolvedValue({
				size: 0,
				isAboveWarningThreshold: false,
			}),
		}

		// Create mocks
		sendEventMock = vi.fn().mockResolvedValue(undefined)
		connectionStatusCallback = vi.fn()
		queueSizeCallback = vi.fn()

		// Create retry manager
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		retryManager = new TelemetryRetryManager(mockQueue as any, sendEventMock, {
			retryIntervalMs: 30000,
			batchSize: 10,
			onConnectionStatusChange: connectionStatusCallback,
			onQueueSizeChange: queueSizeCallback,
		})
	})

	afterEach(() => {
		retryManager.stop()
		vi.useRealTimers()
	})

	describe("start/stop", () => {
		it("should start retry timer", async () => {
			retryManager.start()

			// Wait for immediate processing
			await vi.runOnlyPendingTimersAsync()

			// Should process immediately
			expect(mockQueue.getEventsForRetry).toHaveBeenCalledTimes(1)

			// Advance timer
			vi.advanceTimersByTime(30000)
			await vi.runOnlyPendingTimersAsync()
			expect(mockQueue.getEventsForRetry).toHaveBeenCalledTimes(2)
		})

		it("should not start multiple timers", async () => {
			retryManager.start()
			await vi.runOnlyPendingTimersAsync()

			retryManager.start()

			expect(mockQueue.getEventsForRetry).toHaveBeenCalledTimes(1)
		})

		it("should stop retry timer", async () => {
			retryManager.start()
			await vi.runOnlyPendingTimersAsync()

			retryManager.stop()

			vi.advanceTimersByTime(60000)
			// Should only be called once from initial start
			expect(mockQueue.getEventsForRetry).toHaveBeenCalledTimes(1)
		})
	})

	describe("queueFailedEvent", () => {
		it("should add event to queue", async () => {
			const event: TelemetryEvent = {
				event: TelemetryEventName.TASK_CREATED,
				properties: { taskId: "test-123" },
			}

			await retryManager.queueFailedEvent(event, "Network error")

			expect(mockQueue.enqueue).toHaveBeenCalledWith(event, "Network error")
		})

		it("should update connection status on error", async () => {
			const event: TelemetryEvent = {
				event: TelemetryEventName.TASK_CREATED,
				properties: { taskId: "test-123" },
			}

			await retryManager.queueFailedEvent(event, "Connection failed")

			expect(connectionStatusCallback).toHaveBeenCalledWith(false)
		})

		it("should notify queue size change", async () => {
			mockQueue.getQueueMetadata.mockResolvedValue({
				size: 5,
				isAboveWarningThreshold: false,
			})

			const event: TelemetryEvent = {
				event: TelemetryEventName.TASK_CREATED,
				properties: { taskId: "test-123" },
			}

			await retryManager.queueFailedEvent(event)

			expect(queueSizeCallback).toHaveBeenCalledWith(5, false)
		})
	})

	describe("processQueue", () => {
		it("should process events in batches", async () => {
			const events = Array.from({ length: 25 }, (_, i) => ({
				id: `event-${i}`,
				event: {
					event: TelemetryEventName.TASK_CREATED,
					properties: { taskId: `test-${i}` },
				},
				timestamp: Date.now(),
				retryCount: 0,
			}))

			mockQueue.getEventsForRetry.mockResolvedValue(events)

			retryManager.start()
			await vi.runOnlyPendingTimersAsync()

			// Should process in batches of 10
			expect(sendEventMock).toHaveBeenCalledTimes(25)
			expect(mockQueue.updateEventAfterRetry).toHaveBeenCalledTimes(25)
		})

		it("should handle successful sends", async () => {
			const event = {
				id: "event-1",
				event: {
					event: TelemetryEventName.TASK_CREATED,
					properties: { taskId: "test-1" },
				},
				timestamp: Date.now(),
				retryCount: 0,
			}

			mockQueue.getEventsForRetry.mockResolvedValue([event])
			sendEventMock.mockResolvedValue(undefined)

			retryManager.start()
			await vi.runOnlyPendingTimersAsync()

			expect(mockQueue.updateEventAfterRetry).toHaveBeenCalledWith("event-1", true, undefined)
		})

		it("should handle failed sends", async () => {
			const event = {
				id: "event-1",
				event: {
					event: TelemetryEventName.TASK_CREATED,
					properties: { taskId: "test-1" },
				},
				timestamp: Date.now(),
				retryCount: 0,
			}

			mockQueue.getEventsForRetry.mockResolvedValue([event])
			sendEventMock.mockRejectedValue(new Error("Network error"))

			retryManager.start()
			await vi.runOnlyPendingTimersAsync()

			expect(mockQueue.updateEventAfterRetry).toHaveBeenCalledWith("event-1", false, "Network error")
		})

		it("should update connection status based on results", async () => {
			const events = [
				{
					id: "event-1",
					event: {
						event: TelemetryEventName.TASK_CREATED,
						properties: { taskId: "test-1" },
					},
					timestamp: Date.now(),
					retryCount: 0,
				},
			]

			mockQueue.getEventsForRetry.mockResolvedValue(events)

			// First fail, then succeed
			sendEventMock.mockRejectedValueOnce(new Error("Network error"))

			retryManager.start()
			await vi.runOnlyPendingTimersAsync()

			expect(connectionStatusCallback).toHaveBeenCalledWith(false)

			// Now succeed
			sendEventMock.mockResolvedValueOnce(undefined)
			vi.advanceTimersByTime(30000)
			await vi.runOnlyPendingTimersAsync()

			expect(connectionStatusCallback).toHaveBeenCalledWith(true)
		})

		it("should prune failed events", async () => {
			mockQueue.pruneFailedEvents.mockResolvedValue(3)

			retryManager.start()
			await vi.runOnlyPendingTimersAsync()

			expect(mockQueue.pruneFailedEvents).toHaveBeenCalled()
		})
	})

	describe("triggerRetry", () => {
		it("should manually trigger queue processing", async () => {
			await retryManager.triggerRetry()

			expect(mockQueue.getEventsForRetry).toHaveBeenCalled()
			expect(mockQueue.pruneFailedEvents).toHaveBeenCalled()
		})
	})

	describe("getConnectionStatus", () => {
		it("should return current connection status", () => {
			expect(retryManager.getConnectionStatus()).toBe(true)
		})
	})

	describe("connection check", () => {
		it("should periodically check connection status", async () => {
			// Mock successful connection check
			sendEventMock.mockImplementation((event: TelemetryEvent) => {
				if ((event.event as string) === "telemetry_connection_check") {
					return Promise.resolve()
				}
				return Promise.reject(new Error("Other error"))
			})

			retryManager.start()

			// Advance past connection check interval (1 minute)
			vi.advanceTimersByTime(65000)
			await vi.runOnlyPendingTimersAsync()

			// Should have sent a connection check event
			expect(sendEventMock).toHaveBeenCalledWith(
				expect.objectContaining({
					event: "telemetry_connection_check",
				}),
			)
		})

		it("should update connection status on check failure", async () => {
			// All sends fail
			sendEventMock.mockRejectedValue(new Error("Connection failed"))

			retryManager.start()

			// Advance past connection check interval
			vi.advanceTimersByTime(65000)
			await vi.runOnlyPendingTimersAsync()

			expect(connectionStatusCallback).toHaveBeenCalledWith(false)
		})
	})
})
