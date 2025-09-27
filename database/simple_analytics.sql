-- =====================================================
-- PARTICIPANT STATISTICS TABLE
-- =====================================================

-- Complete Statistics Table
WITH stats AS (
  SELECT 
    'Total Participants' as statistic,
    COUNT(*)::text as count,
    1 as sort_order
  FROM participants
  WHERE assigned_number != 9999

  UNION ALL

  SELECT 
    'Males',
    COUNT(*)::text,
    2
  FROM participants
  WHERE gender = 'male' AND assigned_number != 9999

  UNION ALL

  SELECT 
    'Females',
    COUNT(*)::text,
    3
  FROM participants
  WHERE gender = 'female' AND assigned_number != 9999

  UNION ALL

  SELECT 
    'Paid',
    COUNT(*)::text,
    4
  FROM participants
  WHERE "PAID" = true AND assigned_number != 9999

  UNION ALL

  SELECT 
    'Payment Done',
    COUNT(*)::text,
    5
  FROM participants
  WHERE "PAID_DONE" = true AND assigned_number != 9999
)
SELECT statistic, count 
FROM stats 
ORDER BY sort_order;

-- =====================================================
-- PAYMENT VS MATCHING ANALYSIS
-- =====================================================

-- 3. Participants Who Paid but Did NOT Receive Matches
SELECT 
  p.assigned_number,
  p.name,
  p.gender,
  p."PAID",
  p."PAID_DONE"
FROM participants p
LEFT JOIN match_results mr ON (
  p.assigned_number = mr.participant_a_number OR 
  p.assigned_number = mr.participant_b_number
)
WHERE p."PAID" = true 
  AND p.assigned_number != 9999
  AND mr.id IS NULL
ORDER BY p.assigned_number;

-- 4. Participants Who Paid and DID Receive Matches
SELECT 
  p.assigned_number,
  p.name,
  p.gender,
  p."PAID",
  p."PAID_DONE",
  COUNT(mr.id) as total_matches
FROM participants p
INNER JOIN match_results mr ON (
  p.assigned_number = mr.participant_a_number OR 
  p.assigned_number = mr.participant_b_number
)
WHERE p."PAID" = true 
  AND p.assigned_number != 9999
GROUP BY p.assigned_number, p.name, p.gender, p."PAID", p."PAID_DONE"
ORDER BY total_matches DESC;
