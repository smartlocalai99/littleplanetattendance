export default function AdminAttendanceRedirect() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: "/attendance",
      permanent: false,
    },
  };
}
