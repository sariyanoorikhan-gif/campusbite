ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK (role IN ('STUDENT','STAFF','ADMIN'));
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_price_check" CHECK (price > 0), ADD CONSTRAINT "MenuItem_prep_check" CHECK ("prepMinutes" > 0);
ALTER TABLE "DailyStock" ADD CONSTRAINT "DailyStock_remaining_check" CHECK (remaining >= 0);
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_capacity_check" CHECK (capacity > 0 AND reserved >= 0 AND reserved <= capacity), ADD CONSTRAINT "PickupSlot_time_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Order" ADD CONSTRAINT "Order_status_check" CHECK (status IN ('PLACED','ACCEPTED','PREPARING','READY','COLLECTED','CANCELLED','REJECTED','NO_SHOW')), ADD CONSTRAINT "Order_total_check" CHECK (total > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK (quantity > 0 AND quantity <= 10 AND "unitPrice" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_status_check" CHECK (status IN ('PENDING','PAID','FAILED','REFUND_PENDING','REFUNDED')), ADD CONSTRAINT "Payment_amount_check" CHECK (amount > 0);
ALTER TABLE "CanteenSettings" ADD CONSTRAINT "CanteenSettings_hours_check" CHECK ("openMinute" >= 0 AND "closeMinute" <= 1440 AND "openMinute" < "closeMinute" AND "slotMinutes" >= 5 AND "slotCapacity" > 0);
