-- Count how many males and females signed up
SELECT 
  COUNT(CASE WHEN gender = 'male' THEN 1 END) as males_signed_up,
  COUNT(CASE WHEN gender = 'female' THEN 1 END) as females_signed_up,
  COUNT(*) as total_signups
FROM participants
WHERE assigned_number != 9999;
