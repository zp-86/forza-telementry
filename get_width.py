import json
import numpy as np

def main():
    with open('forza_track_mapping_lap_0.json', 'r') as f:
        data = json.load(f)
    
    # We look at the first 30 seconds of data where they swerve to touch the walls.
    # We can fit a straight line to the first 400 points, since it's a "straight" as the user said.
    # Then we measure the max perpendicular distance from the line on both sides!
    
    swerves = [pt for pt in data if pt['time'] < 30]
    
    if not swerves:
        print("No early data found.")
        return

    x = np.array([pt['x'] for pt in swerves])
    z = np.array([pt['z'] for pt in swerves])

    # Fit a 1D line to these points to find the straight line direction
    # A * x + B * z + C = 0
    # Using numpy polyfit
    p = np.polyfit(x, z, 1)
    
    # Line eq: z = p[0] * x + p[1] -> p[0]*x - z + p[1] = 0
    A = p[0]
    B = -1
    C = p[1]
    
    # Perpendicular distance = |Ax + Bz + C| / sqrt(A^2 + B^2)
    dist = np.abs(A*x + B*z + C) / np.sqrt(A**2 + B**2)
    
    # The car touched one wall, then the other.
    # So the width is the distance between the two extreme lateral points.
    # Let's find signed distance (without abs)
    signed_dist = (A*x + B*z + C) / np.sqrt(A**2 + B**2)
    
    track_width = np.max(signed_dist) - np.min(signed_dist)
    
    # We should add the car's width to this (around 2m) because they tap with the sides.
    # Total width ~ track_width + 2
    
    print(f"Calculated Track Width: {track_width + 2.0:.2f} meters")

if __name__ == '__main__':
    main()
