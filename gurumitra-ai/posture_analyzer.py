import cv2
import mediapipe as mp
import numpy as np

class PostureAnalyzer:
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(static_image_mode=False)
    
    def analyze_video(self, video_path):
        cap = cv2.VideoCapture(video_path)
        frame_count = 0
        slouch_frames = 0
        raised_shoulder_frames = 0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        spine_angles = []

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            frame_count += 1
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.pose.process(image_rgb)
            if results.pose_landmarks:
                landmarks = results.pose_landmarks.landmark
                # Get required keypoints
                left_shoulder = landmarks[self.mp_pose.PoseLandmark.LEFT_SHOULDER]
                right_shoulder = landmarks[self.mp_pose.PoseLandmark.RIGHT_SHOULDER]
                left_hip = landmarks[self.mp_pose.PoseLandmark.LEFT_HIP]
                right_hip = landmarks[self.mp_pose.PoseLandmark.RIGHT_HIP]
                left_knee = landmarks[self.mp_pose.PoseLandmark.LEFT_KNEE]
                right_knee = landmarks[self.mp_pose.PoseLandmark.RIGHT_KNEE]

                # Average points for center
                shoulder = np.mean([[left_shoulder.x, left_shoulder.y], [right_shoulder.x, right_shoulder.y]], axis=0)
                hip = np.mean([[left_hip.x, left_hip.y], [right_hip.x, right_hip.y]], axis=0)
                knee = np.mean([[left_knee.x, left_knee.y], [right_knee.x, right_knee.y]], axis=0)

                # Calculate spine angle
                v1 = np.array(shoulder) - np.array(hip)
                v2 = np.array(knee) - np.array(hip)
                angle = self.angle_between(v1, v2)
                spine_angles.append(angle)
                if angle < 170 and angle >= 150:
                    slouch_frames += 1
                elif angle < 150:
                    slouch_frames += 1

                # Shoulder elevation (y is top-down in image)
                shoulder_elevation = (left_shoulder.y + right_shoulder.y) / 2
                hip_elevation = (left_hip.y + right_hip.y) / 2
                if shoulder_elevation < hip_elevation - 0.05:  # adjust threshold as needed
                    raised_shoulder_frames += 1

        cap.release()
        slouch_percent = (slouch_frames / frame_count) * 100 if frame_count else 0
        raised_shoulder_percent = (raised_shoulder_frames / frame_count) * 100 if frame_count else 0
        avg_spine_angle = np.mean(spine_angles) if spine_angles else 0

        # Feedback
        feedback = []
        if raised_shoulder_percent > 10:
            feedback.append("Shoulders remained raised during explanation—may indicate stress.")
        if slouch_percent > 20:
            feedback.append(f"Slouching observed for {slouch_percent:.1f}% of lecture time.")
        if avg_spine_angle >= 170:
            feedback.append("Good posture maintained.")
        elif avg_spine_angle >= 150:
            feedback.append("Teacher tends to lean forward while explaining concepts.")
        else:
            feedback.append("Poor posture detected. Consider sitting/standing straighter.")

        return {
            "shoulder_tension_percent": raised_shoulder_percent,
            "slouch_percent": slouch_percent,
            "avg_spine_angle": avg_spine_angle,
            "feedback": feedback
        }

    @staticmethod
    def angle_between(v1, v2):
        v1_u = v1 / np.linalg.norm(v1)
        v2_u = v2 / np.linalg.norm(v2)
        angle = np.arccos(np.clip(np.dot(v1_u, v2_u), -1.0, 1.0))
        return np.degrees(angle)
