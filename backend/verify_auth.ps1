# Base URL
$baseUrl = "http://localhost:3000"

# Helper to print results
function Assert-Status($response, $expectedStatus, $message) {
    if ($response.StatusCode -eq $expectedStatus) {
        Write-Host "[PASS] $message" -ForegroundColor Green
    }
    else {
        Write-Host "[FAIL] $message. Expected $expectedStatus, got $($response.StatusCode)" -ForegroundColor Red
        Write-Host $response.Content
    }
}

try {
    # 1. Signup User A
    $emailA = "userA_$(Get-Random)@example.com"
    $pass = "password123"
    Write-Host "Signing up User A ($emailA)..."
    $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/auth/signup" -Body (@{email = $emailA; password = $pass; displayName = "User A" } | ConvertTo-Json) -ContentType "application/json"
    Assert-Status $res 201 "User A Signup"

    # 2. Login User A
    Write-Host "Logging in User A..."
    $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/auth/login" -Body (@{email = $emailA; password = $pass } | ConvertTo-Json) -ContentType "application/json" -SessionVariable sessionA
    Assert-Status $res 200 "User A Login"
    
    # 3. Verify /auth/me
    Write-Host "Verifying /auth/me for User A..."
    $res = Invoke-WebRequest -Method Get -Uri "$baseUrl/auth/me" -WebSession $sessionA
    Assert-Status $res 200 "User A /auth/me"
    $me = $res.Content | ConvertFrom-Json
    if ($me.user.email -eq $emailA) { Write-Host "[PASS] Email matches" -ForegroundColor Green } else { Write-Host "[FAIL] Email mismatch" -ForegroundColor Red }

    # 4. Create Board (Owned by A)
    Write-Host "Creating Board A..."
    $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/boards" -Body '{}' -ContentType "application/json" -WebSession $sessionA
    Assert-Status $res 201 "Board A Creation"
    $boardData = $res.Content | ConvertFrom-Json
    $boardId = $boardData.id
    Write-Host "Board ID: $boardId"

    # 5. Add Stroke (User A)
    Write-Host "User A adding stroke to Board A..."
    $stroke = @{ points = @(@{x = 10; y = 10 }); color = "#000"; width = 2; tool = "pen" } | ConvertTo-Json -Depth 3
    $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/boards/$boardId/strokes" -Body $stroke -ContentType "application/json" -WebSession $sessionA
    Assert-Status $res 201 "User A Add Stroke"

    # 6. Anonymous Access (Should Fail)
    Write-Host "Anonymous user adding stroke to Board A..."
    try {
        $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/boards/$boardId/strokes" -Body $stroke -ContentType "application/json"
        Write-Host "[FAIL] Anonymous access should have failed" -ForegroundColor Red
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 403) {
            Write-Host "[PASS] Anonymous access denied (403)" -ForegroundColor Green
        }
        else {
            Write-Host "[FAIL] Expected 403, got $status" -ForegroundColor Red
        }
    }

    # 7. Signup User B
    $emailB = "userB_$(Get-Random)@example.com"
    Write-Host "Signing up User B ($emailB)..."
    $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/auth/signup" -Body (@{email = $emailB; password = $pass; displayName = "User B" } | ConvertTo-Json) -ContentType "application/json"
    Assert-Status $res 201 "User B Signup"

    # 8. Login User B
    Write-Host "Logging in User B..."
    $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/auth/login" -Body (@{email = $emailB; password = $pass } | ConvertTo-Json) -ContentType "application/json" -SessionVariable sessionB
    Assert-Status $res 200 "User B Login"

    # 9. User B Access Board A (Should Fail)
    Write-Host "User B adding stroke to Board A..."
    try {
        $res = Invoke-WebRequest -Method Post -Uri "$baseUrl/boards/$boardId/strokes" -Body $stroke -ContentType "application/json" -WebSession $sessionB
        Write-Host "[FAIL] User B access should have failed" -ForegroundColor Red
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 403) {
            Write-Host "[PASS] User B access denied (403)" -ForegroundColor Green
        }
        else {
            Write-Host "[FAIL] Expected 403, got $status" -ForegroundColor Red
        }
    }

}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
