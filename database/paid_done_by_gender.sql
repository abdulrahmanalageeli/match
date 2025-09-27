-- Count how many males and females have PAID_DONE = true
SELECT 
  COUNT(CASE WHEN gender = 'male' AND "PAID_DONE" = true THEN 1 END) as males_paid_done,
  COUNT(CASE WHEN gender = 'female' AND "PAID_DONE" = true THEN 1 END) as females_paid_done,
  COUNT(CASE WHEN "PAID_DONE" = true THEN 1 END) as total_paid_done
FROM participants
WHERE assigned_number != 9999;
