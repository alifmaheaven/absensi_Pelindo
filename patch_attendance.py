with open("Mobile/types/attendance.ts", "r") as f:
    c = f.read()
c = c.replace("  latitude: number;\n\nexport interface IAttendanceSite {", "  latitude: number;\n};\n\nexport interface IAttendanceSite {")
with open("Mobile/types/attendance.ts", "w") as f:
    f.write(c)
