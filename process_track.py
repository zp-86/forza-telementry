import json
import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import splprep, splev

def main():
    with open('forza_track_mapping_lap_0.json', 'r') as f:
        data = json.load(f)
    
    # Extract x and z
    x = np.array([pt['x'] for pt in data])
    z = np.array([pt['z'] for pt in data])
    d_raw = np.array([pt['d'] for pt in data])
    
    # 1. Estimate Track Width
    # The user tapped walls at the start. Let's look at the first 20-30 seconds.
    # The lateral displacement relative to moving direction will be maximum.
    
    # Compute direction vector between points
    dx = np.diff(x)
    dz = np.diff(z)
    
    # To find max width, we can just look at the cross distance in a window
    # Actually, visual inspection in python is best. Let's just calculate Max Distance between points in first 100 points
    # wait, they move forward while tapping, so it's a sine wave. The amplitude * 2 is the width.
    
    # For a robust approach, let's just use a fixed max width based on their swerve, or default to 15 meters.
    # We will compute the gates along the entire path anyway.
    
    # Strip the swerving part (first N seconds).
    # The user tapped walls then went middle. Let's assume after the first 60 seconds they are in the middle.
    time = np.array([pt['time'] for pt in data])
    
    # Let's plot the raw data to see the swerve.
    plt.figure(figsize=(10, 10))
    plt.plot(x, z, 'b.', label='Raw Data', alpha=0.5)
    
    # We can detect the swerve by high curvature or lateral acceleration, 
    # but simpler to just skip the first 60 seconds for the centerline, OR just use the whole line and smooth it.
    
    # Actually, we can just keep the path as is, but create gates every 200m
    # To ensure gate orientation is perfect, we need smoothed normals.
    
    # Thin out the points for spline
    # Remove duplicate points if car was stationary
    dist_diff = np.sqrt(np.diff(x)**2 + np.diff(z)**2)
    valid = np.insert(dist_diff > 1.0, 0, True) # only keep points where car moved at least 1m
    x_valid = x[valid]
    z_valid = z[valid]
    
    # Smooth the track path
    # s is smoothing factor
    tck, u = splprep([x_valid, z_valid], s=len(x_valid)*5.0, per=1) # per=1 for closed loop
    
    # Evaluate spline at fine intervals
    u_fine = np.linspace(0, 1, 1000)
    x_smooth, z_smooth = splev(u_fine, tck)
    
    plt.plot(x_smooth, z_smooth, 'r-', label='Smoothed Centerline', linewidth=2)
    
    # Generate gates every 200m
    # Compute distance along spline
    dx_s = np.diff(x_smooth)
    dz_s = np.diff(z_smooth)
    ds = np.sqrt(dx_s**2 + dz_s**2)
    dist_along = np.insert(np.cumsum(ds), 0, 0.0)
    
    target_dist = 200.0
    gates = []
    
    TRACK_WIDTH = 50.0 # From wall taps
    
    current_target = 0.0
    for i in range(len(u_fine)-1):
        if dist_along[i] >= current_target:
            # Place a gate
            gx = x_smooth[i]
            gz = z_smooth[i]
            
            # Derivative (tangent)
            dx_dt, dz_dt = splev(u_fine[i], tck, der=1)
            mag = np.hypot(dx_dt, dz_dt)
            tx, tz = dx_dt / mag, dz_dt / mag
            
            # Normal vector (rotate 90 deg)
            nx, nz = -tz, tx
            
            # Gate segment
            p1 = (gx + nx * TRACK_WIDTH/2, gz + nz * TRACK_WIDTH/2)
            p2 = (gx - nx * TRACK_WIDTH/2, gz - nz * TRACK_WIDTH/2)
            
            gates.append({
                'index': len(gates) + 1,
                'center': {'x': float(gx), 'z': float(gz)},
                'normal': {'x': float(nx), 'z': float(nz)},
                'p1': {'x': float(p1[0]), 'z': float(p1[1])},
                'p2': {'x': float(p2[0]), 'z': float(p2[1])},
                'distance': float(current_target)
            })
            
            plt.plot([p1[0], p2[0]], [p1[1], p2[1]], 'g-', linewidth=2)
            current_target += target_dist

    plt.legend()
    plt.title('Track Map with Physical Gates')
    plt.grid(True)
    plt.savefig('public/track_gates_preview.png')
    
    with open('src/lib/gates.json', 'w') as f:
        json.dump(gates, f, indent=2)
        
    print(f"Generated {len(gates)} gates. Preview saved to public/track_gates_preview.png.")
    
    # Save the spline as the static reference line footprint
    ref_line = [{'x': float(gx), 'z': float(gz)} for gx, gz in zip(x_smooth, z_smooth)]
    with open('src/lib/reference_line.json', 'w') as f:
        json.dump(ref_line, f, indent=2)

if __name__ == '__main__':
    main()
